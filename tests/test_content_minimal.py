"""An old partial checklist must survive the copy-only source catalog upgrade."""
from copy import deepcopy
import json
import pytest
from fastapi.testclient import TestClient
from app import catalog
from app.config import Settings
from app.main import create_app
from test_adaptive_route import start, task, report


@pytest.mark.parametrize('language', ['ru', 'en'])
@pytest.mark.parametrize('regime', ['visa', 'visa_free'])
def test_old_partial_survives_catalog_upgrade_and_restart(tmp_path, monkeypatch, language, regime):
    current = catalog.seed_rules()
    old = deepcopy(current)
    office = next(r for r in old if r['rule_id'] == 'sutd.M03')
    office['documents_i18n']['ru'][2:] = ['Документ об учёбе + 2 копии', 'Нотариальный перевод + 1 копия']
    office['documents_i18n']['en'][2:] = ['Study document + 2 copies', 'Notarised translation + 1 copy']
    settings = Settings(_env_file=None, database_path=str(tmp_path/'copy.sqlite3'), demo_mode=True,
                        prototype_timing=True, bot_transport='disabled', max_bot_token='')
    with monkeypatch.context() as patch:
        patch.setattr(catalog, 'seed_rules', lambda: deepcopy(old))
        with TestClient(create_app(settings)) as first:
            h, _ = start(first, profile=dict(language=language, visa_regime=regime, arrival_status='arrived',
                         entry_at='2026-10-01', entry_purpose='study', residence_type='dorm'))
            report(first, h, 'office', 'partial', missing_documents=[2, 3])
            before = task(first, h, 'office')
            reports = first.get('/api/me/results', headers=h).json()
            assert before['missing_documents'] == [2, 3]
    with TestClient(create_app(settings)) as upgraded:
        after = task(upgraded, h, 'office')
        assert after['task_key'] == before['task_key']
        assert after['rule_version'] == before['rule_version'] + 1
        for field in ('missing_documents', 'reported_outcome', 'workflow_status', 'user_status', 'engine_status'):
            assert after[field] == before[field], field
        # Date provenance advances with the catalog; formula and calculated date do not.
        assert [{k: v for k, v in d.items() if k != 'rule_version'} for d in after['dates']] == [
            {k: v for k, v in d.items() if k != 'rule_version'} for d in before['dates']]
        assert after['documents_i18n'] == next(r for r in current if r['rule_id'] == 'sutd.M03')['documents_i18n']
        assert upgraded.get('/api/me/results', headers=h).json() == reports
        config = upgraded.get('/api/config').json()
        assert config['office_documents']['sutd']['documents_i18n'] == after['documents_i18n']
        with upgraded.app.state.database.transaction() as db:
            versions = db.execute("SELECT * FROM rules WHERE rule_id='sutd.M03' ORDER BY version").fetchall()
            assert len(versions) == 2
            assert versions[0]['status'] == 'archived'
            assert json.loads(versions[0]['body'])['documents_i18n'] == office['documents_i18n']
    with TestClient(create_app(settings)) as restarted:
        assert task(restarted, h, 'office') == after
        assert restarted.get('/api/me/results', headers=h).json() == reports
        # Correct the retained report using the same indices, then complete separately.
        saved = reports['results'][-1]
        result = restarted.post('/api/me/tasks/'+after['task_key']+'/results', headers=h, json=dict(
            outcome='partial', missing_documents=[3], confirmed=True, supersedes_report_id=saved['id'],
            idempotency_key='copy-correct-partial'))
        assert result.status_code == 201, result.text
        assert task(restarted, h, 'office')['missing_documents'] == [3]
        report(restarted, h, 'office', 'completed')
        assert task(restarted, h, 'office')['user_status'] == 'completed'
        assert restarted.delete('/api/me/profile', headers=h).status_code == 200

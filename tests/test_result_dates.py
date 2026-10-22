"""Historical workflow dates must not become timing anchors or dependencies."""
from datetime import date
import pytest
from pydantic import ValidationError
from app.catalog import seed_rules
from app.engine import build_roadmap
from app.models import EventInput, Profile, WorkflowResult


OUTCOMES = {
    'invitation': ['requested', 'received'], 'initial_visa': ['submitted', 'received'],
    'trip': ['completed'], 'office': ['partial', 'completed'],
    'documents': ['question', 'completed', 'question_sent', 'clarified'],
    'registration': ['submitted', 'received'], 'visa_renewal': ['submitted', 'received'],
    'registration_renewal': ['submitted', 'received'],
    'consultation': [], 'entry_context': [],
}
OUTCOMES = {p: list(dict.fromkeys(values + ['question_sent', 'clarified'])) for p, values in OUTCOMES.items()}


def without_report_dates(value):
    if isinstance(value, dict):
        return {k: without_report_dates(v) for k, v in value.items()
                if k not in {'occurred_at', 'result_occurred_at'}}
    if isinstance(value, list):
        return [without_report_dates(v) for v in value]
    return value


@pytest.mark.parametrize('tenant', ['sutd', 'leti'])
@pytest.mark.parametrize('prototype', [False, True])
@pytest.mark.parametrize('process,outcome', [(p, o) for p, values in OUTCOMES.items() for o in values])
def test_nullable_report_date_changes_only_historical_date(tenant, prototype, process, outcome):
    profile = Profile(university_id=tenant, consent=True, age_band='adult', study_status='active',
                      migration_basis='study', arrival_status='arrived', entry_at='2026-10-01',
                      entry_purpose='study', visa_regime='visa', residence_type='dorm',
                      visa_expiry='2026-12-01', registration_expiry='2026-12-01',
                      citizenship='Synthetic country', stay_over_90_days=True,
                      fingerprinting_completed=False).model_dump(mode='json')

    def plan(reports):
        return build_roadmap('synthetic', profile, [], seed_rules(), reports=reports,
                             now=date(2026, 10, 22), prototype_timing=prototype)

    initial = plan([])
    task = next(t for t in initial['tasks'] if t.get('process') == process)
    report = dict(id='synthetic-report', task_key=task['task_key'], process=process,
                  episode_id=task['episode_id'], cycle_id=task['cycle_id'], outcome=outcome,
                  occurred_at=None, recorded_at='2026-10-22T08:00:00+00:00',
                  body={'basis_cycle': initial['facts']['_visa_cycle' if 'visa' in process else '_registration_cycle'],
                        'document_expiry': '2027-01-01' if outcome == 'received' and process != 'invitation' else None,
                        'missing_documents': [0] if outcome == 'partial' else [],
                        'checklist': ['documents', 'arrival', 'housing'] if process == 'trip' else []},
                  dependencies=[], retracted_at=None, supersedes_report_id=None)
    assert without_report_dates(plan([report])) == without_report_dates(plan([{**report, 'occurred_at': '2026-10-03'}]))


def test_result_nullable_does_not_relax_typed_event_date():
    result = WorkflowResult(outcome='completed', confirmed=True, idempotency_key='nullable-result-test')
    assert result.occurred_at is None
    with pytest.raises(ValidationError):
        EventInput(type='medical_completed', payload={}, confirmed=True, idempotency_key='missing-event-date')

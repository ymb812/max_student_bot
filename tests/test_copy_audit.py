"""Copy regressions against the real API with synthetic, temporary databases."""
import pytest
from test_adaptive_route import start, task, report, plan


@pytest.mark.parametrize('tenant', ['sutd', 'leti'])
def test_question_answer_flow_and_invitation_waiting(client, tenant):
    h, _ = start(client, tenant, preparation='unknown')
    report(client, h, 'invitation', 'question_sent')
    waiting = task(client, h, 'invitation')
    assert 'clarified' in waiting['result_actions']
    assert 'ответ' in waiting['waiting_i18n']['ru'].lower()
    assert 'answer' in waiting['waiting_i18n']['en']
    report(client, h, 'invitation', 'clarified')
    assert task(client, h, 'invitation')['user_status'] != 'completed'
    report(client, h, 'invitation', 'requested', external_result=True)
    invitation = task(client, h, 'invitation')
    assert invitation['reported_outcome'] == 'requested'
    assert ('e-mail' in invitation['waiting_i18n']['ru']) == (tenant == 'sutd')
    assert plan(client,h)['effective_profile']['preparation_state'] == 'unknown'


@pytest.mark.parametrize('tenant', ['sutd', 'leti'])
def test_partial_revision_and_localizable_date_error(client, tenant):
    h, _ = start(client, tenant, preparation='unknown', office_package='partial', registration='submitted',
                 profile=dict(arrival_status='arrived',entry_at='2026-10-10',arrival_at='2026-10-11T12:00:00+03:00',entry_purpose='study',residence_type='dorm',study_status='active'))
    office = task(client,h,'office')
    invalid = dict(outcome='partial', occurred_at='2026-10-01', missing_documents=[0], confirmed=True,idempotency_key='partial-error-01')
    response=client.post('/api/me/tasks/'+office['task_key']+'/results',headers=h,json=invalid)
    assert response.status_code == 422
    assert response.json()['error_code'] == 'result_predates_episode'
    assert task(client,h,'office')['missing_documents'] == []
    invalid['occurred_at']='2026-10-12'
    saved=client.post('/api/me/tasks/'+office['task_key']+'/results',headers=h,json=invalid)
    assert saved.status_code == 201
    revision=client.get('/api/me/history/'+saved.json()['revision_id'],headers=h).json()
    change=next(c for c in revision['changes'] if c['task_key']==office['task_key'])
    assert change['before']['missing_documents'] == []
    assert change['after']['missing_documents'] == [0]
    assert change['after']['result_occurred_at'] == '2026-10-12'
    report(client,h,'registration','received')
    assert plan(client,h)['effective_profile']['registration_expiry'] is None


def test_validation_code_and_blank_study_status(client):
    h,_=start(client)
    response=client.post('/api/me/events',headers=h,json=dict(type='enrolment_changed',occurred_at='2026-10-18',payload={'status':''},confirmed=True,idempotency_key='blank-study-status'))
    assert response.status_code==422
    assert response.json()['errors'][0]['field']==['body','payload','status']
    assert plan(client,h)['effective_profile']['study_status']=='admitted'
    t=task(client,h,'invitation')
    response=client.post('/api/me/tasks/'+t['task_key']+'/results',headers=h,json=dict(outcome='received',occurred_at='2026-10-18',document_expiry='2026-10-17',confirmed=True,idempotency_key='invalid-expiry-order'))
    assert response.status_code==422
    assert response.json()['errors'][0]['code']=='expiry_before_receipt'


def test_onboarding_document_lists_use_published_catalog(client):
    config=client.get('/api/config').json()
    for tenant in ('sutd','leti'):
        h,_=start(client,tenant)
        office=task(client,h,'office')
        assert config['office_documents'][tenant]['documents_i18n']==office['documents_i18n']

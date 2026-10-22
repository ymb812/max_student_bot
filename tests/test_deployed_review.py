"""Persisted regressions from the 22 October deployed review; synthetic data only."""
import pytest
from test_adaptive_route import start, task, plan
from uuid import uuid4


def report(client, h, process, outcome, **extra):
    t = task(client, h, process)
    body = dict(outcome=outcome, confirmed=True, idempotency_key=str(uuid4()))
    body.update(extra)
    response = client.post('/api/me/tasks/'+t['task_key']+'/results', headers=h, json=body)
    assert response.status_code == 201, response.text
    return response.json(), t, body


@pytest.mark.parametrize('tenant', ['sutd', 'leti'])
def test_review_answer_does_not_complete_or_clear_review(client, tenant):
    h, _ = start(client, tenant, preparation='visa_received',
                 profile=dict(study_status='transferred', arrival_status='arrived', entry_at='2026-10-16'))
    report(client, h, 'office', 'question_sent')
    assert task(client, h, 'office')['result_actions'] == ['clarified']
    report(client, h, 'office', 'clarified')
    t = task(client, h, 'office')
    assert t['engine_status'] == 'needs_review'
    assert t['user_status'] != 'completed'
    assert t['workflow_status'] == 'needs_help'
    assert t['reported_outcome'] == 'clarified'
    assert t['result_actions'] == ['question_sent']


@pytest.mark.parametrize('tenant', ['sutd', 'leti'])
def test_unknown_entry_package_update_correction_retraction_and_later_entry(client, tenant):
    h, _ = start(client, tenant, office_package='partial', registration='received',
                 profile=dict(arrival_status='arrived', entry_purpose='study', residence_type='dorm'))
    original = task(client, h, 'office')
    registration = task(client, h, 'registration')['result_report_id']
    assert {'partial', 'completed'} <= set(original['result_actions'])
    assert all(not d.get('computed_at') for d in original['dates'])
    saved, _, _ = report(client, h, 'office', 'partial', missing_documents=[0])
    partial = task(client, h, 'office')
    assert partial['missing_documents'] == [0]
    assert partial['user_status'] != 'completed'
    p = client.get('/api/me/profile', headers=h).json()
    p['entry_at'] = '2026-10-16'
    assert client.patch('/api/me/profile', headers=h, json=p).status_code == 200
    assert {'partial', 'completed'} <= set(task(client, h, 'office')['result_actions'])
    assert task(client, h, 'office')['result_report_id'] == partial['result_report_id']
    p['entry_at'] = None
    assert client.patch('/api/me/profile', headers=h, json=p).status_code == 200
    report(client, h, 'office', 'partial', missing_documents=[1],
           supersedes_report_id=partial['result_report_id'], idempotency_key='correct-partial')
    corrected = task(client, h, 'office')
    assert corrected['missing_documents'] == [1]
    report(client, h, 'office', 'completed')
    completed = task(client, h, 'office')
    assert completed['user_status'] == 'completed'
    assert plan(client, h)['effective_profile']['entry_at'] is None
    # Clarification of the SAME initial entry retains keys and independent receipt.
    p = client.get('/api/me/profile', headers=h).json()
    p.update(entry_at='2026-10-16', arrival_at='2026-10-16T12:00:00+03:00')
    assert client.patch('/api/me/profile', headers=h, json=p).status_code == 200
    t = task(client, h, 'office')
    assert t['task_key'] == original['task_key']
    assert t['result_report_id'] == completed['result_report_id']
    assert task(client, h, 'registration')['result_report_id'] == registration
    assert client.delete('/api/me/results/'+completed['result_report_id'], headers=h).status_code == 200
    assert task(client, h, 'office')['missing_documents'] == [1]
    assert task(client, h, 'office')['user_status'] != 'completed'
    assert task(client, h, 'registration')['result_report_id'] == registration
    assert client.delete('/api/me/results/'+corrected['result_report_id'], headers=h).status_code == 200
    assert task(client, h, 'office')['missing_documents'] == [0]
    # A genuinely NEW entry must not inherit office completion or registration.
    response = client.post('/api/me/events', headers=h, json=dict(type='reentry_recorded',
        occurred_at='2026-10-21', payload=dict(entry_purpose='study',residence_type='dorm',visa_regime='visa'),
        confirmed=True,idempotency_key='new-entry-review'))
    assert response.status_code == 201, response.text
    assert task(client, h, 'office')['task_key'] != original['task_key']
    assert task(client, h, 'office').get('result_report_id') is None
    assert task(client, h, 'registration')['user_status'] != 'completed'


@pytest.mark.parametrize('tenant', ['sutd', 'leti'])
def test_initial_visa_context_requires_receipt(client, tenant):
    h, _ = start(client, tenant, preparation='invitation_received')
    assert 'document_kind' not in task(client, h, 'initial_visa')['context_dates']
    assert 'document_kind' not in task(client, h, 'visa_renewal')['context_dates']
    report(client, h, 'initial_visa', 'submitted')
    assert 'document_kind' not in task(client, h, 'initial_visa')['context_dates']
    report(client, h, 'initial_visa', 'received')
    t = task(client, h, 'initial_visa')
    assert t['context_dates']['document_kind'] == 'visa'
    assert t['context_dates']['document_expiry'] is None
    assert task(client, h, 'visa_renewal')['context_dates']['document_kind'] == 'visa'
    report(client, h, 'initial_visa', 'received', document_expiry='2027-09-01',
           supersedes_report_id=t['result_report_id'], idempotency_key='visa-correct-known')
    assert task(client, h, 'initial_visa')['context_dates']['document_expiry'] == '2027-09-01'
    assert plan(client, h)['effective_profile']['visa_expiry'] == '2027-09-01'


@pytest.mark.parametrize('tenant', ['sutd', 'leti'])
def test_office_date_exception_does_not_bypass_context_or_review(client, tenant):
    h, _ = start(client, tenant)
    assert task(client, h, 'office')['availability'] == 'future'
    assert task(client, h, 'office')['result_actions'] == []
    h, _ = start(client, tenant, office_package='partial', profile=dict(
        arrival_status='arrived', study_status='transferred',entry_purpose='study'))
    assert task(client, h, 'office')['result_actions'] == ['question_sent']
    assert task(client, h, 'office')['engine_status'] == 'needs_review'

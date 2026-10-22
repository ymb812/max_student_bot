"""Acceptance against persisted API data, not the supplied frontend prototype."""
import json
from datetime import timedelta
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.timeutil import moscow_today
from app.catalog import seed_rules
from conftest import student


def plan(client, h):
    r = client.get('/api/me/roadmap', headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def task(client, h, process):
    return next(t for t in plan(client, h)['tasks'] if t.get('process') == process and t['engine_status'] != 'superseded')


def start(client, tenant='sutd', **options):
    auth = client.post('/api/auth/demo').json()
    h = {'Authorization': 'Bearer ' + auth['access_token']}
    p = client.get('/api/me/profile', headers=h).json()
    p.update(university_id=tenant, consent=True, arrival_status='planned', age_band='adult', study_status='admitted', migration_basis='study', visa_regime='visa')
    p.update(options.pop('profile', {}))
    body = dict(profile=p, preparation=options.pop('preparation','not_started'), confirmed=True, idempotency_key='onboarding-unique-01', **options)
    r = client.post('/api/me/onboarding', headers=h, json=body)
    assert r.status_code == 200, r.text
    return h, body


def report(client, h, process, outcome, **extra):
    t = task(client, h, process)
    body = dict(outcome=outcome, confirmed=True, idempotency_key=f'{process}-{outcome}-unique-01', **extra)
    r = client.post('/api/me/tasks/'+t['task_key']+'/results', headers=h, json=body)
    assert r.status_code == 201, r.text
    return r.json(), t, body


@pytest.mark.parametrize('tenant', ['sutd', 'leti'])
def test_full_preparation_results_and_actual_entry(client, tenant):
    h, _ = start(client, tenant)
    inv = task(client,h,'invitation')
    assert plan(client,h)['hero_task_key'] == inv['task_key']
    assert task(client,h,'initial_visa')['availability'] == 'future'
    assert client.post('/api/me/tasks/'+task(client,h,'initial_visa')['task_key']+'/results', headers=h, json=dict(outcome='submitted',confirmed=True,idempotency_key='blocked-dependency')).status_code == 409
    report(client,h,'invitation','requested')
    assert task(client,h,'invitation')['workflow_status'] == 'waiting'
    report(client,h,'invitation','received')
    assert task(client,h,'initial_visa')['availability'] == 'available'
    report(client,h,'initial_visa','submitted')
    assert task(client,h,'initial_visa')['user_status'] != 'completed'
    report(client,h,'initial_visa','received')
    assert task(client,h,'trip')['availability'] == 'available'
    report(client,h,'trip','completed', checklist=['documents','arrival','housing'])
    assert plan(client,h)['effective_profile']['entry_at'] is None
    assert plan(client,h)['hero_task_key'] == task(client,h,'entry_context')['task_key']
    event = dict(type='entry_recorded',occurred_at=str(moscow_today()),payload=dict(entry_purpose='study',visa_regime='visa',residence_type='dorm'),confirmed=True,idempotency_key='actual-entry-unique')
    assert client.post('/api/me/events',headers=h,json=event).status_code == 201
    assert task(client,h,'documents')['presentation_stage'] == 'arrival'
    assert task(client,h,'documents')['availability'] == 'available'
    assert task(client,h,'registration')['availability'] == 'available'


def test_visa_ready_does_not_invent_invitation_and_visa_free(client):
    h, _ = start(client, preparation='visa_received')
    assert task(client,h,'initial_visa')['user_status'] == 'completed'
    assert task(client,h,'invitation')['user_status'] == 'not_started'
    assert task(client,h,'invitation')['availability'] == 'past'
    assert task(client,h,'trip')['task_key'] == plan(client,h)['hero_task_key']
    free, _ = start(client, profile=dict(visa_regime='visa_free', study_form='full_time'))
    assert not any(t['process'] in ('invitation','initial_visa','visa_renewal') for t in plan(client,free)['tasks'])
    assert task(client,free,'trip')['engine_status'] == 'actionable'


def test_entry_content_and_office_source_match_the_action():
    rules = seed_rules()
    for tenant in ('sutd', 'leti'):
        entry = next(r for r in rules if r['rule_id'] == f'{tenant}.M02.entry')
        assert entry['documents_i18n']['ru'] == [
            'Документ с отметкой о фактической дате въезда',
            'Миграционная карта с целью въезда, если предусмотрена']
        assert 'application' not in ' '.join(entry['documents_i18n']['en']).lower()
    office = next(r for r in rules if r['rule_id'] == 'sutd.M03')
    source = next(s for s in office['source_snapshot'] if s['id'] == 'S1')
    assert source['section_label'] == 'Миграционный учет'


@pytest.mark.parametrize('unknown_date', [True,False])
def test_late_entry_preserves_results_and_unknown_expiry(client, unknown_date):
    h, body = start(client, profile=dict(arrival_status='arrived',entry_at=None if unknown_date else str(moscow_today()),entry_purpose='study',residence_type='dorm'),office_package='completed',registration='received')
    assert task(client,h,'office')['user_status']=='completed'
    assert task(client,h,'registration')['user_status']=='completed'
    assert plan(client,h)['effective_profile']['registration_expiry'] is None
    assert all(r['occurred_at'] is None for r in client.get('/api/me/results',headers=h).json()['results'])
    if unknown_date:
        assert plan(client,h)['hero_task_key']==task(client,h,'entry_context')['task_key']
        assert client.get('/api/me/events',headers=h).json()['events']==[]
        p=body['profile'];p['entry_at']=str(moscow_today())
        assert client.patch('/api/me/profile',headers=h,json=p).status_code==200
        assert task(client,h,'office')['user_status']=='completed'
        assert task(client,h,'registration')['user_status']=='completed'
    p=client.get('/api/me/profile',headers=h).json();p['registration_expiry']=str(moscow_today()+timedelta(days=90))
    r=client.patch('/api/me/profile',headers=h,json=p)
    assert r.status_code==200,r.text
    assert plan(client,h)['effective_profile']['registration_expiry']==p['registration_expiry']
    assert task(client,h,'registration')['user_status']=='completed'


def test_partial_submission_and_independent_registration(client):
    h,_=start(client, profile=dict(arrival_status='arrived',entry_at=str(moscow_today()),entry_purpose='study',residence_type='private'))
    report(client,h,'office','partial',missing_documents=[0,2])
    assert task(client,h,'office')['missing_documents']==[0,2]
    assert task(client,h,'office')['user_status']=='in_progress'
    report(client,h,'registration','submitted')
    assert task(client,h,'registration')['workflow_status']=='waiting'
    report(client,h,'registration','received')
    assert task(client,h,'registration')['user_status']=='completed'
    assert task(client,h,'office')['user_status']!='completed'
    report(client,h,'documents','question')
    assert task(client,h,'documents')['engine_status']=='needs_review'
    assert task(client,h,'documents')['user_status']!='completed'


@pytest.mark.parametrize('changes', [dict(age_band='minor'),dict(study_status='leave'),dict(migration_basis='rvpo'),dict(entry_purpose='other',arrival_status='arrived',entry_at=str(moscow_today()))])
def test_support_and_other_purpose_do_not_unlock_from_answers(client,changes):
    h,_=start(client,profile=changes)
    assert all(t['engine_status']=='needs_review' for t in plan(client,h)['tasks'])
    assert not any(d['computed_at'] for t in plan(client,h)['tasks'] for d in t['dates'] if d['kind']!='document_expiry')


def test_idempotency_retraction_dependencies_and_independent_history(client):
    h,body=start(client)
    before=client.get('/api/me/history',headers=h).json()
    replay=client.post('/api/me/onboarding',headers=h,json=body)
    assert replay.status_code==200 and not replay.json()['created']
    assert client.get('/api/me/history',headers=h).json()==before
    invitation,_,_=report(client,h,'invitation','received')
    visa,t,request=report(client,h,'initial_visa','submitted')
    n=len(client.get('/api/me/history',headers=h).json()['revisions'])
    assert not client.post('/api/me/tasks/'+t['task_key']+'/results',headers=h,json=request).json()['created']
    assert len(client.get('/api/me/history',headers=h).json()['revisions'])==n
    assert client.delete('/api/me/results/'+invitation['result_id'],headers=h).status_code==200
    assert task(client,h,'initial_visa')['engine_status']=='requires_recheck'
    assert len(client.get('/api/me/results',headers=h).json()['results'])==2


def test_new_episode_does_not_inherit_registration_and_restart(client):
    h,_=start(client,profile=dict(arrival_status='arrived',entry_at=str(moscow_today()),entry_purpose='study',residence_type='dorm'),office_package='completed',registration='received')
    old=task(client,h,'registration')
    payload=dict(type='address_changed',occurred_at=str(moscow_today()),payload=dict(from_residence_type='dorm',residence_type='private'),confirmed=True,idempotency_key='new-address-unique')
    eid=client.post('/api/me/events',headers=h,json=payload).json()['event_id']
    assert task(client,h,'registration')['user_status']!='completed'
    assert next(t for t in plan(client,h)['tasks'] if t['task_key']==old['task_key'])['engine_status']=='requires_recheck'
    expected=plan(client,h)
    with TestClient(create_app(client.app.state.settings)) as restarted:
        assert plan(restarted,h)==expected
    client.delete('/api/me/events/'+eid,headers=h)
    assert task(client,h,'registration')['user_status']=='completed'


def test_renewal_creates_new_cycle_without_false_submission_receipt(client):
    h,_=start(client,profile=dict(arrival_status='arrived',entry_at=str(moscow_today()),entry_purpose='study',residence_type='dorm',visa_expiry=str(moscow_today()+timedelta(days=15))))
    old=task(client,h,'visa_renewal')
    assert plan(client,h)['hero_task_key']==old['task_key']
    report(client,h,'visa_renewal','submitted')
    assert task(client,h,'visa_renewal')['user_status']!='completed'
    report(client,h,'visa_renewal','received',document_expiry=str(moscow_today()+timedelta(days=300)))
    new=task(client,h,'visa_renewal')
    assert new['cycle_id']!=old['cycle_id']
    assert new['user_status']=='not_started'
    assert next(t for t in plan(client,h)['tasks'] if t['task_key']==old['task_key'])['user_status']=='completed'


def test_sources_and_demo_units_preserve_original_and_no_fake_date(client):
    rules=seed_rules()
    overrides=[s for r in rules for s in r['deadline_specs'] if s.get('unit_basis')=='demo_assumption']
    assert len(overrides)==3
    assert all(s['unit']=='working' and s['original_spec']['unit']=='unspecified' for s in overrides)
    assert next(r for r in rules if r['rule_id']=='leti.M03')['deadline_specs'][0]['unit']=='hours'
    h,_=student(client)
    assert all(d['computed_at'] is None for t in plan(client,h)['tasks'] for d in t['dates'] if d['unit']=='working')
    # A failed source check must be disclosed, not replaced by a fabricated section.
    assert all(any(s.get('section_label') or s.get('verification_note_i18n') for s in r['source_snapshot']) for r in rules)
    assert all(s.get('section_label') and s.get('navigation_checked_at') for r in rules for s in r['source_snapshot'] if s.get('navigation_verified'))


def test_results_are_owned_and_deleted_with_profile(client):
    h,_=start(client);other,_=start(client)
    r,t,_=report(client,h,'invitation','requested')
    assert client.delete('/api/me/results/'+r['result_id'],headers=other).status_code==404
    assert client.post('/api/me/tasks/'+t['task_key']+'/results',headers=other,json=dict(outcome='received',confirmed=True,idempotency_key='foreign-result-key')).status_code==404
    client.delete('/api/me/profile',headers=h)
    with client.app.state.database.transaction() as db:
        assert not db.execute('SELECT id FROM workflow_reports WHERE id=?',(r['result_id'],)).fetchone()


def test_unknown_readiness_and_legacy_aggregate_completion(client):
    from app.db import dumps
    from app.service import stamp
    h,_=start(client,preparation='unknown')
    t=task(client,h,'invitation')
    assert t['engine_status']=='conditional' and t['missing_fields']==['preparation_state']
    with client.app.state.database.transaction() as db:
        user_id=db.execute('SELECT id FROM users').fetchone()['id']
        legacy={**t,'rule_id':'sutd.M01','task_key':user_id+':sutd.M01:pre-entry:once','semantic_action_key':'M01:pre-entry:once'}
        legacy.pop('process');legacy.pop('user_status');legacy.pop('completed_at')
        db.execute('INSERT INTO tasks VALUES(?,?,?,?,?)',(legacy['task_key'],user_id,dumps(legacy),'completed',stamp()))
    fresh=plan(client,h)
    assert next(t for t in fresh['tasks'] if t['rule_id']=='sutd.M01')['user_status']=='completed'
    assert next(t for t in fresh['tasks'] if t['rule_id']=='sutd.M01')['engine_status']=='superseded'
    assert all(t['user_status']=='not_started' for t in fresh['tasks'] if t.get('process') in ('invitation','initial_visa','trip'))


def test_known_city_arrival_is_separate_from_entry(client):
    h,_=start(client,'leti',profile=dict(arrival_status='arrived',entry_at='2026-10-18',entry_purpose='study',residence_type='dorm'))
    t=task(client,h,'office')
    assert t['missing_fields']==['arrival_at']
    p=client.get('/api/me/profile',headers=h).json();p['arrival_at']='2026-10-20T10:30:00+03:00'
    assert client.patch('/api/me/profile',headers=h,json=p).status_code==200
    assert task(client,h,'office')['engine_status']=='actionable'
    e=dict(type='entry_recorded',occurred_at='2026-10-18',payload=dict(entry_purpose='study',residence_type='dorm',visa_regime='visa',arrival_at='2026-10-20T10:30:00+03:00'),confirmed=True,idempotency_key='city-arrival-separate')
    assert client.post('/api/me/events',headers=h,json=e).status_code==201


def test_typed_issuance_closes_submission_and_retract_restores(client):
    h,_=student(client)
    _,old,_=report(client,h,'visa_renewal','submitted')
    body=dict(type='visa_issued',occurred_at=str(moscow_today()),payload=dict(visa_expiry=str(moscow_today()+timedelta(days=200))),confirmed=True,idempotency_key='typed-visa-cycle')
    r=client.post('/api/me/events',headers=h,json=body);assert r.status_code==201
    assert next(t for t in plan(client,h)['tasks'] if t['task_key']==old['task_key'])['user_status']=='completed'
    assert client.delete('/api/me/events/'+r.json()['event_id'],headers=h).status_code==200
    assert task(client,h,'visa_renewal')['workflow_status']=='waiting'
    assert task(client,h,'visa_renewal')['user_status']=='in_progress'


def test_atomic_failure_and_single_outbox_on_retry(client, monkeypatch):
    import app.service as service
    h,_=start(client)
    with client.app.state.database.transaction() as db:
        db.execute('UPDATE users SET max_user_id=1234567')
    original=service.recalculate
    def fail(*args,**kwargs):
        original(*args,**kwargs)
        raise RuntimeError('injected transaction failure')
    t=task(client,h,'invitation');body=dict(outcome='requested',confirmed=True,idempotency_key='transaction-failure-01')
    monkeypatch.setattr(service,'recalculate',fail)
    with pytest.raises(RuntimeError):
        client.post('/api/me/tasks/'+t['task_key']+'/results',headers=h,json=body)
    assert client.get('/api/me/results',headers=h).json()['results']==[]
    with client.app.state.database.transaction() as db:
        assert db.execute('SELECT COUNT(*) FROM outbox').fetchone()[0]==0
    monkeypatch.setattr(service,'recalculate',original)
    for _ in range(2):
        assert client.post('/api/me/tasks/'+t['task_key']+'/results',headers=h,json=body).status_code==201
    with client.app.state.database.transaction() as db:
        assert db.execute('SELECT COUNT(*) FROM outbox').fetchone()[0]==1


def test_working_calendar_convention_holidays_and_transfers():
    from app.timeutil import working_date
    c=dict(verified=True,version='synthetic-2026',days={'2026-10-17':False,'2026-10-18':False,'2026-10-19':True,'2026-10-20':True})
    assert working_date('2026-10-16',2,c)=='2026-10-20'
    c['days']['2026-10-17']=True;c['days']['2026-10-19']=False
    assert working_date('2026-10-16',2,c)=='2026-10-20'
    assert working_date('2026-10-16',3,c) is None # missing calendar coverage
    assert working_date('2026-10-16',2,None) is None
    c['days']['2026-10-16']=True
    assert working_date('2026-10-20',-2,c)=='2026-10-16'


def test_cross_stage_priority_and_waiting_does_not_repeat_submission(client):
    h,_=start(client,'leti',profile=dict(arrival_status='arrived',entry_at=str(moscow_today()),entry_purpose='study',residence_type='dorm',visa_expiry=str(moscow_today()+timedelta(days=10))))
    p=plan(client,h);visa=task(client,h,'visa_renewal')
    assert p['hero_task_key']==visa['task_key']
    assert all(d['computed_at'] is None for d in visa['dates'] if d['kind']!='document_expiry')
    report(client,h,'visa_renewal','submitted')
    assert plan(client,h)['hero_task_key']!=visa['task_key']
    assert task(client,h,'visa_renewal')['result_actions']==['received']


def test_overdue_action_precedes_entry_clarification_and_waiting():
    from app.workflow import rank_tasks
    common=dict(engine_status='actionable',user_status='not_started',priority_bucket='now',availability='available',dates=[])
    tasks=[dict(common,task_key='entry',process='entry_context',engine_status='conditional'),
           dict(common,task_key='waiting',workflow_status='waiting',dates=[dict(kind='university_submission_deadline',computed_at='2026-09-01')]),
           dict(common,task_key='renewal',dates=[dict(kind='university_submission_deadline',computed_at='2026-10-20')])]
    assert rank_tasks(tasks,'2026-10-21')=='renewal'


def test_cancel_document_basis_retains_later_results_for_recheck(client):
    h,_=start(client,preparation='visa_received',profile=dict(visa_expiry=str(moscow_today()+timedelta(days=10))))
    initial=client.get('/api/me/results',headers=h).json()['results'][0]
    event=dict(type='entry_recorded',occurred_at=str(moscow_today()),payload=dict(entry_purpose='study',residence_type='dorm',visa_regime='visa'),confirmed=True,idempotency_key='entry-renewal-history')
    assert client.post('/api/me/events',headers=h,json=event).status_code==201
    report(client,h,'office','completed')
    renewal,old,_=report(client,h,'visa_renewal','received',document_expiry=str(moscow_today()+timedelta(days=200)))
    assert client.delete('/api/me/results/'+initial['id'],headers=h).status_code==200
    retained=next(t for t in plan(client,h)['tasks'] if t['task_key']==old['task_key'])
    assert retained['engine_status']=='requires_recheck'
    assert retained['workflow_status']=='needs_help'
    assert task(client,h,'office')['user_status']=='completed'
    assert any(r['id']==renewal['result_id'] and r['retracted_at'] is None for r in client.get('/api/me/results',headers=h).json()['results'])


def test_result_correction_and_undo_preserve_independent_registration(client):
    h,_=start(client,profile=dict(arrival_status='arrived',entry_at=str(moscow_today()),entry_purpose='study',residence_type='dorm'))
    original,office,_=report(client,h,'office','partial',missing_documents=[0])
    report(client,h,'registration','received')
    correction=dict(outcome='completed',confirmed=True,supersedes_report_id=original['result_id'],idempotency_key='correct-office-result')
    r=client.post('/api/me/tasks/'+office['task_key']+'/results',headers=h,json=correction)
    assert r.status_code==201,r.text
    assert task(client,h,'office')['user_status']=='completed'
    assert not client.post('/api/me/tasks/'+office['task_key']+'/results',headers=h,json=correction).json()['created']
    assert client.delete('/api/me/results/'+r.json()['result_id'],headers=h).status_code==200
    assert task(client,h,'office')['workflow_status']=='partial'
    assert task(client,h,'office')['missing_documents']==[0]
    assert task(client,h,'registration')['user_status']=='completed'


@pytest.mark.parametrize('process,field', [('visa_renewal','visa_expiry'),('registration_renewal','registration_expiry')])
def test_expiry_clarification_keeps_renewal_receipt_as_current_fact(client,process,field):
    h,_=start(client,profile=dict(arrival_status='arrived',entry_at=str(moscow_today()),entry_purpose='study',residence_type='dorm',visa_expiry=str(moscow_today()+timedelta(days=20)),registration_expiry=str(moscow_today()+timedelta(days=20))))
    receipt,_,_=report(client,h,process,'received',document_expiry=str(moscow_today()+timedelta(days=200)))
    p=client.get('/api/me/profile',headers=h).json()
    p[field]=str(moscow_today()+timedelta(days=210))
    assert client.patch('/api/me/profile?fields='+field,headers=h,json=p).status_code==200
    current=plan(client,h)['effective_profile']
    result_field='visa_result_id' if process=='visa_renewal' else 'registration_result_id'
    assert current[field]==p[field] and current[result_field]!=receipt['result_id']
    count=len(client.get('/api/me/results',headers=h).json()['results'])
    assert client.patch('/api/me/profile?fields='+field,headers=h,json=p).status_code==200
    assert len(client.get('/api/me/results',headers=h).json()['results'])==count
    p[field]=None
    assert client.patch('/api/me/profile?fields='+field,headers=h,json=p).status_code==200
    assert plan(client,h)['effective_profile'][field] is None
    assert plan(client,h)['effective_profile'][result_field]


def test_city_arrival_clarification_is_bound_to_recorded_entry(client):
    h,_=start(client,'leti')
    event=dict(type='entry_recorded',occurred_at=str(moscow_today()),payload=dict(entry_purpose='study',residence_type='dorm',visa_regime='visa'),confirmed=True,idempotency_key='arrival-clarification-entry')
    first=client.post('/api/me/events',headers=h,json=event).json()['event_id']
    assert task(client,h,'office')['missing_fields']==['arrival_at']
    p=client.get('/api/me/profile',headers=h).json();p['arrival_at']=str(moscow_today()-timedelta(days=1))+'T00:00:00+03:00'
    assert client.patch('/api/me/profile?fields=arrival_at',headers=h,json=p).status_code==422
    p['arrival_at']=str(moscow_today())+'T00:00:00+03:00'
    assert client.patch('/api/me/profile?fields=arrival_at',headers=h,json=p).status_code==200
    assert plan(client,h)['effective_profile']['arrival_at']==p['arrival_at']
    assert task(client,h,'office')['engine_status']=='actionable'
    report(client,h,'office','partial',missing_documents=[0])
    event.update(type='reentry_recorded',idempotency_key='arrival-clarification-reentry')
    second=client.post('/api/me/events',headers=h,json=event).json()['event_id']
    assert plan(client,h)['effective_profile']['arrival_at'] is None
    assert task(client,h,'office')['missing_fields']==['arrival_at']
    assert client.patch('/api/me/profile?fields=arrival_at',headers=h,json=p).status_code==200
    assert plan(client,h)['effective_profile']['arrival_at']==p['arrival_at']
    assert client.get('/api/me/profile',headers=h).json()['arrival_at_episode_id']==second
    assert first!=second

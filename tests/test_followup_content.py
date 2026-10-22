from app.catalog import seed_rules
from test_adaptive_route import start, task, report, plan
import pytest


def test_sources_distinguish_verified_procedure_from_unavailable_invitation():
    rules={r['rule_id']:r for r in seed_rules()}
    invitation=next(s for s in rules['leti.M01.invitation']['source_snapshot'] if s['id']=='E1')
    assert invitation['official_url'].endswith('/do-priezda')
    assert invitation['checked_at'] is None
    assert not invitation['navigation_verified']
    assert invitation['confidence']=='U'
    assert rules['leti.M01.invitation']['norm_confidence']=='C'
    renewal=next(s for s in rules['leti.M07']['source_snapshot'] if s['id']=='E1')
    assert renewal['official_url'].endswith('/migracionnoe-soprovozhdenie')
    assert renewal['navigation_verified']
    assert 'продление' in renewal['section_label']
    # Editorial research cannot promote historical federal evidence to a new check.
    for rule in rules.values():
        for source in rule['source_snapshot']:
            if source['id'].startswith('F'):
                assert source['checked_at']=='2026-09-27'


@pytest.mark.parametrize('regime', ['visa','visa_free'])
def test_leti_renewal_checklist_is_scoped_and_office_indices_stay_stable(client,regime):
    h,_=start(client,'leti',preparation='unknown',profile=dict(visa_regime=regime,arrival_status='arrived',entry_at='2026-10-10',arrival_at='2026-10-10T12:00:00+03:00',entry_purpose='study',residence_type='dorm',study_status='active',registration_expiry='2027-02-01'))
    renewal=task(client,h,'registration_renewal')
    assert ('Паспорт: оригинал и две копии значимых страниц' in renewal['documents_i18n']['ru']) == (regime=='visa')
    if regime=='visa_free':
        assert 'общежития' in renewal['document_guidance_i18n']['ru']
    office=task(client,h,'office')
    assert office['context_dates']['entry_at']=='2026-10-10'
    assert 'residence_event_at' not in office['context_dates']
    assert office['documents_i18n']['ru'][0]=='Копия паспорта'
    report(client,h,'office','partial',missing_documents=[0])
    assert task(client,h,'office')['missing_documents']==[0]


@pytest.mark.parametrize('tenant',['sutd','leti'])
def test_recorded_context_survives_later_visa_cycle_in_history(client,tenant):
    h,_=start(client,tenant,preparation='unknown',profile=dict(arrival_status='arrived',entry_at='2026-10-10',arrival_at='2026-10-10T12:00:00+03:00',entry_purpose='study',study_status='active',residence_type='dorm',visa_expiry='2027-01-20'))
    saved,old,_=report(client,h,'visa_renewal','submitted')
    report(client,h,'visa_renewal','received',document_expiry='2027-10-20',occurred_at='2026-10-15')
    assert task(client,h,'visa_renewal')['context_dates']['document_expiry']=='2027-10-20'
    rev=client.get('/api/me/history/'+saved['revision_id'],headers=h).json()
    recorded=next(c['after'] for c in rev['changes'] if c['task_key']==old['task_key'])
    assert recorded['context_dates']['document_expiry']=='2027-01-20'


def test_final_review_state_controls_explanation_and_confidence(client):
    h,_=start(client,'leti',profile=dict(age_band='minor'))
    for t in plan(client,h)['tasks']:
        assert t['engine_status']=='needs_review'
        assert t['eligibility_confidence']!='P'
        assert 'возраст до 18 лет' in t['eligibility_reason']['ru']
        assert 'изменённый учебный статус' not in t['eligibility_reason']['ru']


def test_timing_failure_explains_missing_calendar_without_inventing_date(client):
    h,_=start(client,'sutd',preparation='unknown',profile=dict(arrival_status='arrived',entry_at='2026-10-10',entry_purpose='study',study_status='active',residence_type='dorm'))
    office=task(client,h,'office')
    d=next(d for d in office['dates'] if d['unit']=='working')
    assert d['computed_at'] is None
    assert d['calculation_status']=='working_calendar_unavailable'


def test_private_registration_does_not_get_dormitory_renewal_checklist(client):
    h,_=start(client,'leti',preparation='unknown',profile=dict(arrival_status='arrived',entry_at='2026-10-10',arrival_at='2026-10-10T12:00:00+03:00',entry_purpose='study',residence_type='private',study_status='active',registration_expiry='2027-02-01'))
    renewal=task(client,h,'registration_renewal')
    assert 'частному адресу' in renewal['document_guidance_i18n']['ru']
    assert 'Фотография 3 × 4' not in renewal['documents_i18n']['ru']

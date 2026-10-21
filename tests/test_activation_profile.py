"""A date-free situation is UI context, never evidence of entry or eligibility."""


def test_situation_persists_without_facts_or_dates(client):
    auth = client.post('/api/auth/demo').json()
    headers = {'Authorization': 'Bearer ' + auth['access_token']}
    profile = client.get('/api/me/profile', headers=headers).json()
    profile.update(university_id='leti', arrival_status='arrived', visa_regime='visa',
                   residence_type='unknown', consent=True)
    response = client.patch('/api/me/profile', headers=headers, json=profile)
    assert response.status_code == 200
    saved = client.get('/api/me/profile', headers=headers).json()
    assert saved['arrival_status'] == 'arrived'
    assert saved['consent'] is True
    assert saved['entry_at'] is None and saved['planned_entry'] is None
    assert client.get('/api/me/events', headers=headers).json()['events'] == []
    before = client.get('/api/me/roadmap', headers=headers).json()
    assert before['effective_profile']['entry_at'] is None
    assert all(d['computed_at'] is None for t in before['tasks'] for d in t['dates'])
    profile['arrival_status'] = 'planned'
    assert client.patch('/api/me/profile', headers=headers, json=profile).status_code == 200
    after = client.get('/api/me/roadmap', headers=headers).json()
    # New route context affects availability, never fabricates the missing event/date.
    assert next(t for t in before['tasks'] if t['process']=='invitation')['availability']=='past'
    assert next(t for t in after['tasks'] if t['process']=='invitation')['availability']=='available'
    assert next(t for t in before['tasks'] if t['process']=='entry_context')['missing_fields']==['entry_at']
    assert client.get('/api/me/events', headers=headers).json()['events'] == []
    # Older clients may omit the new field; only the documented enum is accepted.
    del profile['arrival_status']
    assert client.patch('/api/me/profile', headers=headers, json=profile).status_code == 200
    profile['arrival_status'] = 'invented'
    assert client.patch('/api/me/profile', headers=headers, json=profile).status_code == 422

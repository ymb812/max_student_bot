from conftest import student
from test_roadmap import event


def test_event_receipt_replay_and_owned_revision(client):
    owner, _ = student(client)
    other, _ = student(client)
    result = event(client, owner, "address_changed", "ui-address-1", {
        "from_residence_type": "dorm", "residence_type": "private",
    }).json()
    revision = client.get('/api/me/history/' + result['revision_id'], headers=owner)
    assert revision.status_code == 200
    assert revision.json()['trigger_id'] == result['event_id']
    assert revision.json()['changes']
    assert client.get('/api/me/history/' + result['revision_id'], headers=other).status_code == 404
    replay = event(client, owner, "address_changed", "ui-address-1", {
        "from_residence_type": "dorm", "residence_type": "private",
    }).json()
    assert replay['revision_id'] == result['revision_id']
    assert replay['created'] is False
    retracted = client.delete('/api/me/events/' + result['event_id'], headers=owner).json()
    assert retracted['revision_id'] != result['revision_id']
    assert client.get('/api/me/history/' + retracted['revision_id'], headers=owner).json()['reason'] == 'event_retracted'
    assert event(client, owner, "address_changed", "ui-address-1", {
        "from_residence_type": "dorm", "residence_type": "private",
    }).json()['revision_id'] == result['revision_id']


def test_no_diff_event_has_persisted_empty_revision(client):
    owner, _ = student(client, fingerprinting_completed=True)
    first = event(client, owner, 'fingerprinting_completed', 'ui-fingerprint-1').json()
    second = event(client, owner, 'fingerprinting_completed', 'ui-fingerprint-2').json()
    assert first['revision_id'] != second['revision_id']
    revision = client.get('/api/me/history/' + second['revision_id'], headers=owner).json()
    assert revision['changes'] == []
    assert revision['trigger_id'] == second['event_id']
    assert client.get('/api/me/history?offset=-1', headers=owner).status_code == 422

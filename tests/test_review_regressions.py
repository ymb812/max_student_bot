"""API edge cases identified during the full project review."""
from conftest import student
import asyncio
import httpx
import pytest
from app.language import propose_event
from app.config import Settings
from app.max_client import worker, MaxClient
from app.service import enqueue


def test_registration_rejects_stay_expiry_before_confirmation(client):
    headers, _ = student(client)
    event = {
        'type': 'registration_confirmed', 'occurred_at': '2026-09-03',
        'payload': {'residence_type': 'dorm', 'registration_expiry': '2027-02-01',
                    'stay_expiry': '2026-09-02'},
        'idempotency_key': 'review-stay-expiry', 'confirmed': True,
    }
    assert client.post('/api/me/events', headers=headers, json=event).status_code == 422
    assert client.get('/api/me/events', headers=headers).json()['events'] == []
    event['payload']['stay_expiry'] = '2027-01-15'
    assert client.post('/api/me/events', headers=headers, json=event).status_code == 201
    facts = client.get('/api/me/roadmap', headers=headers).json()['effective_profile']
    assert facts['stay_expiry'] == '2027-01-15'
    assert facts['registration_expiry'] == '2027-02-01'


def test_config_exposes_configured_bot_username_but_no_secrets(client):
    client.app.state.settings.max_bot_username = 'configured_review_bot'
    config = client.get('/api/config').json()
    assert config['max_bot_username'] == 'configured_review_bot'
    assert 'max_bot_token' not in config
    assert 'editor_sutd_key' not in config


@pytest.mark.parametrize('content', ['[]', 'null', '"text"', '{"type":"address_changed","confidence":true,"language":"ru"}'])
def test_malformed_llm_output_uses_local_fallback(monkeypatch, content):
    real_client = httpx.AsyncClient
    transport = httpx.MockTransport(lambda request: httpx.Response(
        200, json={'choices': [{'message': {'content': content}}]}))
    monkeypatch.setattr('app.language.httpx.AsyncClient', lambda **kwargs: real_client(transport=transport, **kwargs))
    result = asyncio.run(propose_event('I moved', Settings(
        _env_file=None, llm_base_url='https://model.test', llm_model='synthetic')))
    assert result['mode'] == 'local_fallback'
    assert result['candidate']['type'] == 'address_changed'
    assert result['requires_confirmation'] is True


@pytest.mark.parametrize('case', ['disabled', 'completed', 'changed_timing', 'current'])
def test_queued_reminder_rechecks_current_state(client, monkeypatch, case):
    headers, profile = student(client)
    task = next(t for t in client.get('/api/me/roadmap', headers=headers).json()['tasks'] if t['family'] == 'M07')
    with client.app.state.database.transaction() as db:
        user_id = db.execute('SELECT id FROM users').fetchone()['id']
        db.execute('UPDATE users SET max_user_id=42 WHERE id=?', (user_id,))
        timing = task['dates'][0].copy()
        if case == 'changed_timing': timing['rule_version'] = -1
        enqueue(db, user_id, 'review-reminder', {'kind': 'reminder', 'language': 'ru', 'task_key': task['task_key'], 'timing': timing})
    if case == 'disabled':
        profile['reminders_enabled'] = False
        assert client.patch('/api/me/profile', headers=headers, json=profile).status_code == 200
    if case == 'completed':
        assert client.patch('/api/me/tasks/'+task['task_key']+'/status', headers=headers, json={'status':'completed'}).status_code == 200
    sent = []
    async def fake_send(*args, **kwargs): sent.append(args)
    async def stop(seconds): raise asyncio.CancelledError()
    monkeypatch.setattr(MaxClient, 'send', fake_send)
    monkeypatch.setattr('app.max_client.asyncio.sleep', stop)
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(worker(client.app.state.database, client.app.state.settings.model_copy(update={'bot_transport':'webhook'})))
    assert len(sent) == (1 if case == 'current' else 0)
    with client.app.state.database.transaction() as db:
        assert db.execute("SELECT status FROM outbox WHERE dedupe_key='review-reminder'").fetchone()['status'] == ('sent' if case == 'current' else 'cancelled')

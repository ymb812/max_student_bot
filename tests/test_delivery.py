import asyncio
import json
import httpx
from conftest import student, editor
from test_roadmap import event
from test_admin import prepare
from app.max_client import worker, MaxClient


def max_identity_in_unit_test(client, headers):
    # Only an isolated test database and a fake Bot API are used.
    with client.app.state.database.transaction() as db:
        user_id = db.execute("SELECT id FROM users").fetchone()["id"]
        db.execute("UPDATE users SET max_user_id=42 WHERE id=?", (user_id,))


def test_publication_outbox_dedupe_and_delivery(client, monkeypatch):
    h, _ = student(client, reminders_enabled=False)
    max_identity_in_unit_test(client, h)
    eh = editor(client)
    path, p = prepare(client, eh)
    body = dict(
        confirmed=True, preview_token=p["preview_token"], idempotency_key="publish-0001"
    )
    client.post(path + "/publish", headers=eh, json=body)
    client.post(path + "/publish", headers=eh, json=body)
    with client.app.state.database.transaction() as db:
        rows = db.execute("SELECT * FROM outbox").fetchall()
        assert len(rows) == 1
        assert json.loads(rows[0]["body"])["demo_model"]
    sent = []

    async def fake_send(self, max_id, text, task_key=None):
        sent.append((max_id, text))
        return {"success": True}

    async def stop_after_iteration(seconds):
        raise asyncio.CancelledError()

    monkeypatch.setattr(MaxClient, "send", fake_send)
    monkeypatch.setattr("app.max_client.asyncio.sleep", stop_after_iteration)
    settings = client.app.state.settings.model_copy(update={"bot_transport": "webhook"})
    try:
        asyncio.run(worker(client.app.state.database, settings))
    except asyncio.CancelledError:
        pass
    assert len(sent) == 1 and "Демонстрационное" in sent[0][1]
    assert 'Владелец: Вуз' in sent[0][1] and 'МСК' in sent[0][1]
    assert 'Рекомендация вуза' in sent[0][1]
    with client.app.state.database.transaction() as db:
        assert db.execute("SELECT status FROM outbox").fetchone()["status"] == "sent"


def test_max_error_does_not_rollback_roadmap(client, monkeypatch):
    h, _ = student(client)
    max_identity_in_unit_test(client, h)
    event(client, h, "fingerprinting_completed", "fingerprint-1")

    async def fail_send(*args, **kwargs):
        raise httpx.ConnectError("fake transport failure")

    async def stop_after_iteration(seconds):
        raise asyncio.CancelledError()

    monkeypatch.setattr(MaxClient, "send", fail_send)
    monkeypatch.setattr("app.max_client.asyncio.sleep", stop_after_iteration)
    settings = client.app.state.settings.model_copy(update={"bot_transport": "webhook"})
    try:
        asyncio.run(worker(client.app.state.database, settings))
    except asyncio.CancelledError:
        pass
    with client.app.state.database.transaction() as db:
        row = db.execute("SELECT * FROM outbox").fetchone()
        assert (
            row["status"] == "pending"
            and row["attempts"] == 1
            and row["last_error"] == "ConnectError"
        )
        assert (
            db.execute(
                "SELECT COUNT(*) FROM events WHERE type='fingerprinting_completed'"
            ).fetchone()[0]
            == 1
        )
        assert (
            db.execute(
                "SELECT COUNT(*) FROM tasks WHERE user_status='completed'"
            ).fetchone()[0]
            >= 1
        )

import hashlib
import hmac
import json
from urllib.parse import urlencode
import pytest
from fastapi import HTTPException
from app.auth import validate_launch_data
from app.max_client import accept_update


def sign(values, token="test-bot-token"):
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    text = "\n".join(f"{k}={v}" for k, v in sorted(values.items()))
    digest = hmac.new(secret, text.encode(), hashlib.sha256).hexdigest()
    return urlencode({**values, "hash": digest})


def test_real_hmac_algorithm_and_expiration():
    values = {"auth_date": "1000", "user": json.dumps({"id": 42})}
    raw = sign(values)
    assert validate_launch_data(raw, "test-bot-token", now=1100) == 42
    for malformed in (
        raw + "&auth_date=1000",
        raw + "&hash=x",
        raw.replace("1000", "1001"),
        sign({**values, "auth_date": "9999"}),
    ):
        with pytest.raises(HTTPException):
            validate_launch_data(malformed, "test-bot-token", now=1100)
    with pytest.raises(HTTPException):
        validate_launch_data(raw, "test-bot-token", now=5000)


def test_inbox_dedup_and_no_raw_text(client):
    update = {
        "update_type": "message_created",
        "message": {
            "sender": {"user_id": 42},
            "body": {"mid": "mid-1", "text": "secret private text"},
        },
    }
    with client.app.state.database.transaction() as db:
        accept_update(db, update)
        accept_update(db, update)
        rows = db.execute("SELECT * FROM inbox").fetchall()
        assert len(rows) == 1 and "secret" not in rows[0]["body"]


def test_webhook_disabled_or_wrong_secret(client):
    assert client.post("/api/max/webhook", json={}).status_code == 403


def test_delete_profile_removes_navigation_identity_but_keeps_dedup_tombstone(client):
    from conftest import student
    from app.service import enqueue

    h, _ = student(client)
    update = {"update_type": "bot_started", "user": {"user_id": 42}, "timestamp": 123}
    with client.app.state.database.transaction() as db:
        db.execute("UPDATE users SET max_user_id=42")
        accept_update(db, update)
        enqueue(
            db,
            "bot-navigation",
            "test-navigation",
            {"kind": "navigation", "max_user_id": 42},
        )
    assert client.delete("/api/me/profile", headers=h).status_code == 200
    with client.app.state.database.transaction() as db:
        assert (
            "max_user_id" not in db.execute("SELECT body FROM inbox").fetchone()["body"]
        )
        assert db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0] == 0
        accept_update(db, update)
        assert db.execute("SELECT COUNT(*) FROM inbox").fetchone()[0] == 1

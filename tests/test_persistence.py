import sqlite3
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.config import Settings
from app.operations import backup_database, verify_snapshot
from conftest import student, editor
from test_admin import prepare
from test_roadmap import event, current, roadmap


def test_process_restart_and_snapshot_retain_state(tmp_path):
    settings = Settings(
        _env_file=None,
        database_path=str(tmp_path / "live.sqlite3"),
        demo_mode=True,
        editor_sutd_key="test-sutd",
        bot_transport="disabled",
        max_bot_token="fake-test-token",
    )
    with TestClient(create_app(settings)) as first:
        h, profile = student(first, reminders_enabled=False)
        key = current(roadmap(first, h), "M07")[0]["task_key"]
        first.patch(
            "/api/me/tasks/" + key + "/status", headers=h, json={"status": "completed"}
        )
        eid = event(
            first,
            h,
            "address_changed",
            "restart-move-01",
            {"from_residence_type": "dorm", "residence_type": "private"},
        ).json()["event_id"]
        with first.app.state.database.transaction() as db:
            db.execute("UPDATE users SET max_user_id=42")
        eh = editor(first)
        path, p = prepare(first, eh)
        first.post(
            path + "/publish",
            headers=eh,
            json={
                "confirmed": True,
                "preview_token": p["preview_token"],
                "idempotency_key": "restart-publish-01",
            },
        )
        expected = roadmap(first, h)
        snapshot = tmp_path / "backups" / "review.sqlite3"
        report = backup_database(settings.database_path, snapshot)
        assert report["tables"]["events"] == 1 and report["tables"]["publications"] == 1
        assert report["tables"]["outbox"] == 1
    # New application and connections, with the same persisted session and rule catalog.
    with TestClient(create_app(settings)) as reopened:
        assert roadmap(reopened, h) == expected
        assert (
            event(
                reopened,
                h,
                "address_changed",
                "restart-move-01",
                {"from_residence_type": "dorm", "residence_type": "private"},
            ).json()["event_id"]
            == eid
        )
        with reopened.app.state.database.transaction() as db:
            assert db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0] == 1
    # Recovery is tested against an independent snapshot, never the running database.
    restored_settings = settings.model_copy(update={"database_path": str(snapshot)})
    with TestClient(create_app(restored_settings)) as recovered:
        assert roadmap(recovered, h) == expected
        recovered.delete("/api/me/events/" + eid, headers=h)
        assert roadmap(recovered, h)["effective_profile"]["residence_type"] == "dorm"
    with TestClient(create_app(settings)) as original:
        assert roadmap(original, h) == expected


def test_backup_rejects_overwrite_and_path_escape(client, tmp_path):
    source = client.app.state.settings.database_path
    target = tmp_path / "backups" / "copy.sqlite3"
    backup_database(source, target)
    with pytest.raises(FileExistsError):
        backup_database(source, target)
    with pytest.raises(ValueError):
        backup_database(source, tmp_path / "outside.sqlite3")
    assert verify_snapshot(target)["rules"] == 20


def test_snapshot_rejects_foreign_database(tmp_path):
    path = tmp_path / "other.sqlite3"
    with sqlite3.connect(path) as db:
        db.execute("CREATE TABLE unrelated(id INTEGER)")
    with pytest.raises(ValueError):
        verify_snapshot(path)

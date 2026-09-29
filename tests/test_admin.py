from conftest import student, editor, draft
from datetime import date
from test_roadmap import event


def prepare(client, headers, body=None):
    r = client.post("/api/admin/rules", headers=headers, json=body or draft())
    assert r.status_code == 201, r.text
    data = r.json()
    path = f"/api/admin/rules/{data['rule_id']}/versions/{data['version']}"
    assert client.post(path + "/validate", headers=headers).status_code == 200
    preview = client.post(path + "/preview", headers=headers)
    assert preview.status_code == 200
    return path, preview.json()


def test_publish_diff_affected_tenant_status_and_idempotency(client):
    h, _ = student(client)
    leti, _ = student(client, "leti")
    visa_free, _ = student(client, visa_regime="visa_free", visa_expiry=None)
    eh = editor(client)
    before_leti = client.get("/api/me/roadmap", headers=leti).json()
    path, p = prepare(client, eh)
    assert p["affected_count"] == 1
    body = dict(
        confirmed=True, preview_token=p["preview_token"], idempotency_key="publish-0001"
    )
    response = client.post(path + "/publish", headers=eh, json=body)
    assert response.status_code == 200, response.text
    assert response.json()["affected_count"] == 1
    assert client.post(path + "/publish", headers=eh, json=body).status_code == 200
    plan = client.get("/api/me/roadmap", headers=h).json()
    custom = [t for t in plan["tasks"] if t["demo_model"]]
    assert len(custom) == 1 and custom[0]["dates"][0]["computed_at"] == "2026-09-27"
    assert client.get("/api/me/roadmap", headers=leti).json() == before_leti
    assert client.patch(path, headers=eh, json=draft()).status_code == 409


def test_preview_conflict_requires_new_review(client):
    h, profile = student(client)
    eh = editor(client)
    path, p = prepare(client, eh)
    profile["visa_expiry"] = "2027-01-01"
    client.patch("/api/me/profile", headers=h, json=profile)
    assert (
        client.post(
            path + "/publish",
            headers=eh,
            json=dict(
                confirmed=True,
                preview_token=p["preview_token"],
                idempotency_key="publish-0001",
            ),
        ).status_code
        == 409
    )


def test_tenant_and_legal_layer_protected(client):
    sutd_editor, leti_editor = editor(client), editor(client, "leti")
    path, _ = prepare(client, sutd_editor)
    assert client.post(path + "/preview", headers=leti_editor).status_code == 404
    assert (
        client.post("/api/admin/rules", headers=sutd_editor, json=draft(family="M05")).status_code
        == 422
    )
    assert (
        client.post(
            "/api/admin/rules", headers=sutd_editor, json=draft(rule_id="leti.M07")
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/admin/rules", headers=sutd_editor, json=draft(rule_id="sutd.M07")
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/admin/rules/sutd.M05/versions/1/validate", headers=sutd_editor
        ).status_code
        == 403
    )


def test_unknown_time_unit_cannot_be_computed(client):
    eh = editor(client)
    body = draft()
    body["deadline_specs"][0]["unit"] = "unspecified"
    assert client.post("/api/admin/rules", headers=eh, json=body).status_code == 422
    body["deadline_specs"][0]["offset"] = None
    assert client.post("/api/admin/rules", headers=eh, json=body).status_code == 201


def test_new_version_preserves_completion(client):
    h, _ = student(client)
    eh = editor(client)
    path, p = prepare(client, eh)
    client.post(
        path + "/publish",
        headers=eh,
        json=dict(
            confirmed=True,
            preview_token=p["preview_token"],
            idempotency_key="publish-0001",
        ),
    )
    task = next(
        t
        for t in client.get("/api/me/roadmap", headers=h).json()["tasks"]
        if t["demo_model"]
    )
    client.patch(
        "/api/me/tasks/" + task["task_key"] + "/status",
        headers=h,
        json={"status": "completed"},
    )
    body = draft()
    body["deadline_specs"][0]["offset"] = -70
    path, p = prepare(client, eh, body)
    client.post(
        path + "/publish",
        headers=eh,
        json=dict(
            confirmed=True,
            preview_token=p["preview_token"],
            idempotency_key="publish-0002",
        ),
    )
    after = next(
        t
        for t in client.get("/api/me/roadmap", headers=h).json()["tasks"]
        if t["demo_model"]
    )
    assert after["rule_version"] == 2 and after["user_status"] == "completed"
    assert (
        after["completed_at"] == task["completed_at"]
        or after["completed_at"] is not None
    )


def test_future_rule_activation_recalculates_and_notifies_once(client, monkeypatch):
    monkeypatch.setattr("app.service.moscow_today", lambda: date(2026, 9, 27))
    monkeypatch.setattr("app.engine.moscow_today", lambda: date(2026, 9, 27))
    h, _ = student(client, reminders_enabled=False)
    eh = editor(client)
    path, p = prepare(client, eh, draft(effective_from="2026-09-28"))
    assert p["affected_count"] == 0
    r = client.post(
        path + "/publish",
        headers=eh,
        json=dict(
            confirmed=True,
            preview_token=p["preview_token"],
            idempotency_key="future-publish-01",
        ),
    )
    assert r.status_code == 200
    with client.app.state.database.transaction() as db:
        db.execute("UPDATE users SET max_user_id=42")
    assert not any(
        t["demo_model"]
        for t in client.get("/api/me/roadmap", headers=h).json()["tasks"]
    )
    monkeypatch.setattr("app.service.moscow_today", lambda: date(2026, 9, 28))
    monkeypatch.setattr("app.engine.moscow_today", lambda: date(2026, 9, 28))
    assert any(
        t["demo_model"]
        for t in client.get("/api/me/roadmap", headers=h).json()["tasks"]
    )
    client.get("/api/me/roadmap", headers=h)
    with client.app.state.database.transaction() as db:
        assert db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0] == 1
        assert (
            db.execute(
                "SELECT COUNT(*) FROM revisions WHERE reason='rule_effective'"
            ).fetchone()[0]
            == 1
        )


def test_event_triggered_local_rule_uses_event_anchor_and_episode(client):
    h, _ = student(client)
    eh = editor(client)
    body = draft(family="M09", trigger_types=["address_changed"])
    body["deadline_specs"][0].update(anchor_field="occurred_at", offset=0)
    path, p = prepare(client, eh, body)
    assert p["affected_count"] == 0
    client.post(
        path + "/publish",
        headers=eh,
        json=dict(
            confirmed=True,
            preview_token=p["preview_token"],
            idempotency_key="event-publish-01",
        ),
    )
    eid = event(
        client,
        h,
        "address_changed",
        "move-trigger-01",
        {"from_residence_type": "dorm", "residence_type": "private"},
    ).json()["event_id"]
    task = next(
        t
        for t in client.get("/api/me/roadmap", headers=h).json()["tasks"]
        if t["demo_model"]
    )
    assert task["episode_id"] == eid and task["dates"][0]["computed_at"] == "2026-09-27"
    client.delete("/api/me/events/" + eid, headers=h)
    assert (
        next(
            t
            for t in client.get("/api/me/roadmap", headers=h).json()["tasks"]
            if t["demo_model"]
        )["engine_status"]
        == "superseded"
    )

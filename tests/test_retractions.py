from conftest import student
from test_roadmap import current, event, roadmap


def test_fingerprint_retraction_restores_previous_task_status(client):
    h, _ = student(client)
    t = current(roadmap(client, h), "M06")[0]
    client.patch(
        "/api/me/tasks/" + t["task_key"] + "/status",
        headers=h,
        json={"status": "in_progress"},
    )
    eid = event(client, h, "fingerprinting_completed", "fingerprint-1").json()[
        "event_id"
    ]
    assert current(roadmap(client, h), "M06")[0]["user_status"] == "completed"
    client.delete("/api/me/events/" + eid, headers=h)
    t = current(roadmap(client, h), "M06")[0]
    assert t["user_status"] == "in_progress" and t["completed_at"] is None


def test_registration_confirmation_archives_old_residence_and_retracts(client):
    h, _ = student(client)
    old = current(roadmap(client, h), "M04")[0]["task_key"]
    event(
        client,
        h,
        "address_changed",
        "address-001",
        {"from_residence_type": "dorm", "residence_type": "private"},
    )
    r = event(
        client,
        h,
        "registration_confirmed",
        "registration-1",
        {"residence_type": "private", "registration_expiry": "2027-01-01"},
    )
    assert r.status_code == 201
    assert (
        next(t for t in roadmap(client, h)["tasks"] if t["task_key"] == old)[
            "engine_status"
        ]
        == "superseded"
    )
    client.delete("/api/me/events/" + r.json()["event_id"], headers=h)
    assert (
        next(t for t in roadmap(client, h)["tasks"] if t["task_key"] == old)[
            "engine_status"
        ]
        == "requires_recheck"
    )


def test_medical_report_closes_previous_cycle_and_retraction_restores_status(client):
    h, _ = student(client, last_medical_completed_at="2025-09-01")
    old = current(roadmap(client, h), "M10")[0]["task_key"]
    client.patch(
        "/api/me/tasks/" + old + "/status", headers=h, json={"status": "in_progress"}
    )
    eid = event(client, h, "medical_completed", "medical-cycle-01").json()["event_id"]
    after = roadmap(client, h)
    assert (
        next(t for t in after["tasks"] if t["task_key"] == old)["user_status"]
        == "completed"
    )
    assert current(after, "M10")[0]["user_status"] == "not_started"
    changes = client.get("/api/me/history", headers=h).json()["revisions"][0]["changes"]
    assert (
        next(c for c in changes if c["task_key"] == old)["after"]["user_status"]
        == "completed"
    )
    client.delete("/api/me/events/" + eid, headers=h)
    restored = current(roadmap(client, h), "M10")[0]
    assert restored["task_key"] == old and restored["user_status"] == "in_progress"
    assert restored["completed_at"] is None


def test_initial_medical_report_closes_task_and_retracts(client):
    h, _ = student(client)
    old = current(roadmap(client, h), "M05")[0]["task_key"]
    eid = event(client, h, "medical_completed", "medical-initial-01").json()["event_id"]
    assert (
        next(t for t in roadmap(client, h)["tasks"] if t["task_key"] == old)[
            "user_status"
        ]
        == "completed"
    )
    client.delete("/api/me/events/" + eid, headers=h)
    assert current(roadmap(client, h), "M05")[0]["user_status"] == "not_started"

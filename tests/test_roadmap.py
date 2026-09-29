from conftest import student


def roadmap(client, headers):
    response = client.get("/api/me/roadmap", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def current(plan, family):
    return [
        t
        for t in plan["tasks"]
        if t["family"] == family and t["engine_status"] != "superseded"
    ]


def event(client, headers, typ, key, payload=None, occurred_at="2026-09-27", **kwargs):
    return client.post(
        "/api/me/events",
        headers=headers,
        json=dict(
            type=typ,
            occurred_at=occurred_at,
            payload=payload or {},
            idempotency_key=key,
            confirmed=True,
            **kwargs,
        ),
    )


def test_two_universities_and_safe_deadlines(client):
    sutd, _ = student(client)
    leti, _ = student(client, "leti")
    sutd_plan, leti_plan = roadmap(client, sutd), roadmap(client, leti)
    assert len(current(sutd_plan, "M03")) == 1
    assert current(sutd_plan, "M07")[0]["dates"][0]["computed_at"] == "2026-10-02"
    assert current(sutd_plan, "M08")[0]["dates"][0]["computed_at"] == "2026-10-12"
    assert current(sutd_plan, "M03")[0]["dates"][0]["computed_at"] is None
    assert current(leti_plan, "M07")[0]["dates"][0]["computed_at"] is None
    assert current(leti_plan, "M03")[0]["dates"][0]["computed_at"] is None
    for plan in (sutd_plan, leti_plan):
        assert len(plan["tasks"]) > 5
        assert all(
            d["computed_at"] is None
            for t in plan["tasks"]
            for d in t["dates"]
            if d["kind"] == "legal_deadline"
        )
        assert current(plan, "M05")[0]["engine_status"] == "needs_review"


def test_unknown_input_vs_unsupported(client):
    h, p = student(client, citizenship=None)
    t = current(roadmap(client, h), "M05")[0]
    assert t["engine_status"] == "conditional" and "citizenship" in t["missing_fields"]
    p.update(age_band="minor")
    client.patch("/api/me/profile", headers=h, json=p)
    t = current(roadmap(client, h), "M05")[0]
    assert t["engine_status"] == "needs_review"
    assert not any(d["computed_at"] for d in t["dates"])


def test_initial_unknown_entry_purpose_can_be_clarified_without_guessing_reentry(client):
    h, p = student(client, entry_at=None, entry_purpose="unknown")
    first = event(
        client,
        h,
        "entry_recorded",
        "initial-entry-unknown",
        {"residence_type": "dorm", "entry_purpose": "unknown", "visa_regime": "visa"},
    )
    assert first.status_code == 201, first.text
    assert current(roadmap(client, h), "M02")[0]["engine_status"] == "conditional"
    p["entry_purpose"] = "study"
    assert client.patch("/api/me/profile", headers=h, json=p).status_code == 200
    clarified = roadmap(client, h)
    assert clarified["effective_profile"]["entry_purpose"] == "study"
    assert current(clarified, "M02")[0]["engine_status"] == "actionable"
    second = event(
        client,
        h,
        "reentry_recorded",
        "reentry-purpose-unknown",
        {"residence_type": "dorm", "entry_purpose": "unknown", "visa_regime": "visa"},
        occurred_at="2026-09-28",
    )
    assert second.status_code == 201, second.text
    assert roadmap(client, h)["effective_profile"]["entry_purpose"] == "unknown"


def test_private_accommodation_has_no_dorm_50_day_rule(client):
    h, _ = student(client, residence_type="private")
    assert not any(
        d["kind"] == "university_submission_deadline"
        for d in current(roadmap(client, h), "M08")[0]["dates"]
    )


def test_visa_free_no_visa_tasks_and_short_stay_no_medical(client):
    h, _ = student(
        client, visa_regime="visa_free", visa_expiry=None, stay_over_90_days=False
    )
    plan = roadmap(client, h)
    assert not current(plan, "M07")
    assert not current(plan, "M05") and not current(plan, "M06")


def test_status_survives_recalculation_and_reopen(client):
    h, p = student(client)
    task = current(roadmap(client, h), "M07")[0]
    response = client.patch(
        "/api/me/tasks/" + task["task_key"] + "/status",
        headers=h,
        json={"status": "completed"},
    )
    assert response.status_code == 200
    p["language"] = "en"
    client.patch("/api/me/profile", headers=h, json=p)
    after = current(roadmap(client, h), "M07")[0]
    assert after["user_status"] == "completed" and after["completed_at"]
    count = len(client.get("/api/me/history", headers=h).json()["revisions"])
    roadmap(client, h)
    assert len(client.get("/api/me/history", headers=h).json()["revisions"]) == count


def test_address_event_replay_recheck_and_retraction(client):
    h, _ = student(client)
    before = roadmap(client, h)
    old = current(before, "M04")[0]
    client.patch(
        "/api/me/tasks/" + old["task_key"] + "/status",
        headers=h,
        json={"status": "completed"},
    )
    r = event(
        client,
        h,
        "address_changed",
        "address-001",
        {"from_residence_type": "dorm", "residence_type": "private"},
    )
    assert r.status_code == 201, r.text
    after = roadmap(client, h)
    old_after = next(t for t in after["tasks"] if t["task_key"] == old["task_key"])
    assert (
        old_after["engine_status"] == "requires_recheck"
        and old_after["user_status"] == "completed"
    )
    assert after["effective_profile"]["visa_expiry"] == "2026-12-01"
    assert not any(t["family"] == "M09" for t in after["tasks"])
    assert len(
        {
            t["semantic_action_key"]
            for t in after["tasks"]
            if t["engine_status"] != "superseded"
        }
    ) == len([t for t in after["tasks"] if t["engine_status"] != "superseded"])
    assert (
        client.delete("/api/me/events/" + r.json()["event_id"], headers=h).status_code
        == 200
    )
    restored = roadmap(client, h)
    assert restored["effective_profile"]["residence_type"] == "dorm"
    assert (
        next(t for t in restored["tasks"] if t["task_key"] == old["task_key"])[
            "engine_status"
        ]
        == "actionable"
    )


def test_duplicate_events_and_key_conflict(client):
    h, _ = student(client)
    a = event(client, h, "fingerprinting_completed", "fingerprint-1")
    b = event(client, h, "fingerprinting_completed", "fingerprint-1")
    assert a.json()["event_id"] == b.json()["event_id"]
    assert b.json()["created"] is False
    assert event(client, h, "medical_completed", "fingerprint-1").status_code == 409


def test_reentry_does_not_reset_biometrics_or_visa(client):
    h, _ = student(client)
    event(client, h, "fingerprinting_completed", "fingerprint-1")
    old = current(roadmap(client, h), "M06")[0]
    r = event(
        client,
        h,
        "reentry_recorded",
        "reentry-0001",
        {"residence_type": "dorm", "entry_purpose": "study", "visa_regime": "visa"},
    )
    assert r.status_code == 201
    plan = roadmap(client, h)
    assert current(plan, "M06")[0]["task_key"] == old["task_key"]
    assert current(plan, "M06")[0]["user_status"] == "completed"
    assert plan["effective_profile"]["visa_expiry"] == "2026-12-01"


def test_correction_is_a_new_audited_record(client):
    h, _ = student(client)
    a = event(
        client,
        h,
        "address_changed",
        "move-00001",
        {"from_residence_type": "dorm", "residence_type": "private"},
    ).json()["event_id"]
    b = event(
        client,
        h,
        "address_changed",
        "move-00002",
        {"from_residence_type": "dorm", "residence_type": "other"},
        supersedes_event_id=a,
    )
    assert b.status_code == 201
    assert roadmap(client, h)["effective_profile"]["residence_type"] == "other"
    assert len(client.get("/api/me/events", headers=h).json()["events"]) == 2
    assert client.delete("/api/me/events/" + a, headers=h).status_code == 409
    client.delete("/api/me/events/" + b.json()["event_id"], headers=h)
    assert roadmap(client, h)["effective_profile"]["residence_type"] == "private"


def test_new_medical_cycle_and_visa_cycle(client):
    h, _ = student(client)
    event(client, h, "medical_completed", "medical-0001")
    plan = roadmap(client, h)
    assert not current(plan, "M05")
    assert len(current(plan, "M10")) == 1
    assert not any(d["computed_at"] for d in current(plan, "M10")[0]["dates"])
    old = current(plan, "M07")[0]["task_key"]
    event(client, h, "visa_issued", "visa-0000001", {"visa_expiry": "2027-09-01"})
    assert current(roadmap(client, h), "M07")[0]["task_key"] != old


def test_unconfirmed_and_sensitive_payload_rejected(client):
    h, _ = student(client)
    body = dict(
        type="medical_completed",
        occurred_at="2026-09-27",
        payload={"diagnosis": "x"},
        idempotency_key="medical-0001",
        confirmed=True,
    )
    assert client.post("/api/me/events", headers=h, json=body).status_code == 422
    body["payload"] = {}
    body["confirmed"] = False
    assert client.post("/api/me/events", headers=h, json=body).status_code == 422


def test_roles_ownership_and_deletion(client):
    h, _ = student(client)
    other, _ = student(client, "leti")
    key = current(roadmap(client, h), "M07")[0]["task_key"]
    assert (
        client.patch(
            "/api/me/tasks/" + key + "/status",
            headers=other,
            json={"status": "completed"},
        ).status_code
        == 404
    )
    assert client.get("/api/admin/rules", headers=h).status_code == 403
    assert client.get("/api/me/profile").status_code == 401
    assert client.delete("/api/me/profile", headers=h).status_code == 200
    assert client.get("/api/me/profile", headers=h).status_code == 401


def test_language_candidate_cannot_mutate_without_confirmation(client):
    h, _ = student(client)
    before = roadmap(client, h)
    r = client.post("/api/me/candidates", headers=h, json={"text": "Я переехал"}).json()
    assert r["candidate"]["type"] == "address_changed"
    assert roadmap(client, h) == before
    assert client.get("/api/me/events", headers=h).json()["events"] == []
    body = dict(
        occurred_at="2026-09-27",
        payload={"from_residence_type": "dorm", "residence_type": "private"},
        confirmed=True,
        idempotency_key="candidate-01",
    )
    assert (
        client.post(
            "/api/me/candidates/" + r["candidate_id"] + "/confirm", headers=h, json=body
        ).status_code
        == 200
    )
    assert roadmap(client, h)["effective_profile"]["residence_type"] == "private"

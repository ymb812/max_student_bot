"""Exercise the actual public fixtures through the normal student API."""

import json
from datetime import timedelta
from pathlib import Path

from app.timeutil import moscow_today


def test_demo_fixtures_are_independent_dynamic_and_legally_safe(client):
    fixtures = json.loads(
        Path("app/static/demo-profiles.json").read_text(encoding="utf-8")
    )
    sessions, plans = {}, {}
    for name, fixture in fixtures.items():
        auth = client.post("/api/auth/demo").json()
        assert auth["demo_model"] is True
        headers = {"Authorization": "Bearer " + auth["access_token"]}
        profile = client.get("/api/me/profile", headers=headers).json()
        profile.update(fixture["profile"], consent=True, reminders_enabled=False)
        profile.update(
            {
                field: (moscow_today() + timedelta(days=days)).isoformat()
                for field, days in fixture["date_offsets"].items()
            }
        )
        assert client.patch(
            "/api/me/profile", headers=headers, json=profile
        ).status_code == 200
        sessions[name] = headers
        plans[name] = client.get("/api/me/roadmap", headers=headers).json()
        assert plans[name]["demo_model"] is True
        assert all(
            d["computed_at"] is None
            for task in plans[name]["tasks"]
            for d in task["dates"]
            if d["kind"] == "legal_deadline"
        )

    def task(name, family):
        return next(t for t in plans[name]["tasks"] if t["family"] == family)

    assert task("incomplete", "M05")["engine_status"] == "conditional"
    assert "age_band" in task("incomplete", "M05")["missing_fields"]
    assert task("sutd_visa", "M05")["engine_status"] == "needs_review"
    assert task("sutd_visa", "M07")["dates"][0]["computed_at"] == (
        moscow_today() + timedelta(days=7)
    ).isoformat()
    assert task("sutd_visa", "M08")["dates"][0]["computed_at"] == (
        moscow_today() + timedelta(days=12)
    ).isoformat()
    assert not any(t["family"] == "M07" for t in plans["sutd_visa_free"]["tasks"])
    assert not any(
        d["kind"] == "university_submission_deadline"
        for d in task("sutd_visa_free", "M08")["dates"]
    )
    assert task("leti_visa", "M07")["dates"][0]["computed_at"] is None
    visa_task = task("sutd_visa", "M07")
    response = client.patch(
        "/api/me/tasks/" + visa_task["task_key"] + "/status",
        headers=sessions["sutd_visa"],
        json={"status": "in_progress"},
    )
    assert response.status_code == 200
    for name, headers in sessions.items():
        fresh = client.get("/api/me/roadmap", headers=headers).json()
        if name == "sutd_visa":
            assert next(t for t in fresh["tasks"] if t["family"] == "M07")[
                "user_status"
            ] == "in_progress"
        else:
            assert {t["task_key"]: t["user_status"] for t in fresh["tasks"]} == {
                t["task_key"]: t["user_status"] for t in plans[name]["tasks"]
            }
        assert client.get("/api/me/profile", headers=headers).json()[
            "university_id"
        ] == fixtures[name]["profile"]["university_id"]

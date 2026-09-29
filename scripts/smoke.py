"""Deployed API check with isolated synthetic profiles, cleaned up afterwards.
No fake MAX identity or real messages. The rule targets a unique test citizenship.
"""

import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import httpx
from app.config import Settings

settings = Settings()
base = sys.argv[1] if len(sys.argv) > 1 else settings.public_base_url
fixtures = json.loads(Path("tests/fixtures/profiles.json").read_text(encoding="utf-8"))
run_id = uuid.uuid4().hex
country = "Synthetic smoke " + run_id
profiles, rule_path, editor_headers = [], None, None


def call(path, method="GET", body=None, headers=None, expected=200):
    response = httpx.request(
        method, base + path, json=body, headers=headers, timeout=25
    )
    assert response.status_code == expected, (
        path,
        response.status_code,
        response.text[:500],
    )
    return response.json()


try:
    call("/health")
    for tenant, profile in fixtures.items():
        auth = call("/api/auth/demo", "POST")
        headers = {"Authorization": "Bearer " + auth["access_token"]}
        profiles.append(headers)
        profile["citizenship"] = country
        call("/api/me/profile", "PATCH", profile, headers)
        plan = call("/api/me/roadmap", headers=headers)
        assert len(plan["tasks"]) >= 6
        assert all(
            d["computed_at"] is None
            for t in plan["tasks"]
            for d in t["dates"]
            if d["kind"] == "legal_deadline"
        )
        visa = next(t for t in plan["tasks"] if t["family"] == "M07")
        assert bool(visa["dates"][0]["computed_at"]) == (tenant == "sutd")
        call(
            "/api/me/tasks/" + visa["task_key"] + "/status",
            "PATCH",
            {"status": "in_progress"},
            headers,
        )
        event = dict(
            type="address_changed",
            occurred_at="2026-09-27",
            payload={
                "from_residence_type": profile["residence_type"],
                "residence_type": "private",
            },
            confirmed=True,
            idempotency_key=run_id,
        )
        a = call("/api/me/events", "POST", event, headers, 201)
        b = call("/api/me/events", "POST", event, headers, 201)
        assert a["event_id"] == b["event_id"] and not b["created"]
        call("/api/me/events/" + a["event_id"], "DELETE", headers=headers)
        assert (
            next(
                t
                for t in call("/api/me/roadmap", headers=headers)["tasks"]
                if t["task_key"] == visa["task_key"]
            )["user_status"]
            == "in_progress"
        )
        print(tenant, "roadmap, persistence, safe dates, events/retraction: PASS")
    auth = call("/api/auth/editor", "POST", {"key": settings.editor_sutd_key})
    editor_headers = {"Authorization": "Bearer " + auth["access_token"]}
    # A known, nonmatching campus also excludes incomplete main-campus profiles.
    # Keep the affected-count guard before publication on a shared test database.
    isolated = call("/api/me/profile", headers=profiles[0])
    isolated["campus_id"] = "vshte"
    call("/api/me/profile", "PATCH", isolated, profiles[0])
    rule = {
        "rule_id": "demo.smoke." + run_id,
        "family": "M07",
        "semantic_action_key": "demo.smoke." + run_id,
        "title_i18n": {"ru": "Демо-проверка API", "en": "Demo API check"},
        "action_i18n": {
            "ru": "Модельное действие для теста",
            "en": "Synthetic test action",
        },
        "documents_i18n": {"ru": ["Уточнить в офисе"], "en": ["Ask the office"]},
        "contact": "Модельный офис / Model office",
        "eligibility_predicate": {"citizenship": country, "campus_id": "vshte"},
        "trigger_types": [],
        "deadline_specs": [],
        "source_type": "demo_model",
        "source_url": "https://example.org/synthetic-check",
        "source_title": "Synthetic API smoke test",
        "checked_at": "2026-09-27",
        "effective_from": "2026-09-27",
        "evidence_note": "Isolated synthetic test, not a university instruction",
    }
    draft = call("/api/admin/rules", "POST", rule, editor_headers, 201)
    rule_path = f"/api/admin/rules/{draft['rule_id']}/versions/{draft['version']}"
    result = call(rule_path + "/validate", "POST", headers=editor_headers)
    assert result["validated"]
    preview = call(rule_path + "/preview", "POST", headers=editor_headers)
    assert preview["affected_count"] == 1
    result = call(
        rule_path + "/publish",
        "POST",
        {
            "confirmed": True,
            "preview_token": preview["preview_token"],
            "idempotency_key": run_id,
        },
        editor_headers,
    )
    assert result["affected_count"] == 1
    assert any(
        t["rule_id"] == rule["rule_id"]
        for t in call("/api/me/roadmap", headers=profiles[0])["tasks"]
    )
    assert not any(
        t["rule_id"] == rule["rule_id"]
        for t in call("/api/me/roadmap", headers=profiles[1])["tasks"]
    )
    print("admin validation, affected preview, publication, tenant isolation: PASS")
finally:
    if rule_path and editor_headers:
        call(rule_path + "/archive", "POST", headers=editor_headers)
    for headers in profiles:
        call("/api/me/profile", "DELETE", headers=headers)
    print("Synthetic profiles removed; model rule archived")

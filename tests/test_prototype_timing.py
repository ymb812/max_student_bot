from copy import deepcopy
from datetime import date
import pytest
from fastapi.testclient import TestClient
from app.catalog import seed_rules
from app.config import Settings
from app.engine import build_roadmap
from app.main import create_app
from app.models import Profile
from app.prototype_timing import prototype_date, VERSION
from conftest import student


def profile(tenant="sutd", **changes):
    values = dict(consent=True, university_id=tenant, arrival_status="arrived", age_band="adult", citizenship="Synthetic country", migration_basis="study", study_status="active", entry_purpose="study", stay_over_90_days=True, residence_type="dorm", visa_regime="visa", entry_at="2026-10-05", arrival_at="2026-10-05T10:00:00+03:00", visa_expiry="2027-02-25", registration_expiry="2027-03-13", fingerprinting_completed=False)
    values.update(changes)
    return Profile(**values).model_dump(mode="json")


def tasks(p, enabled):
    return {t["family"]: t for t in build_roadmap("test", p, [], seed_rules(), now=date(2026, 10, 22), prototype_timing=enabled)["tasks"]}


@pytest.mark.parametrize("tenant", ["sutd", "leti"])
def test_concrete_dates_are_dynamic_and_default_calculation_stays_unchanged(tenant):
    p = profile(tenant)
    demo, standard = tasks(p, True), tasks(p, False)
    expected = {"M04": "2026-10-14", "M05": "2026-11-04", "M06": "2027-01-03", "M03": "2026-10-07" if tenant == "sutd" else "2026-10-06", "M07": "2026-12-27" if tenant == "sutd" else "2026-12-24"}
    for family, value in expected.items():
        assert demo[family]["dates"][0]["computed_at"] == value
    for family in ("M04", "M05", "M06"):
        assert standard[family]["dates"][0]["computed_at"] is None
        assert demo[family]["dates"][0]["prototype_assumption"] == VERSION
        assert demo[family]["engine_status"] == "actionable"
    moved = tasks(profile(tenant, entry_at="2026-10-06", arrival_at="2026-10-06T10:00:00+03:00"), True)
    assert moved["M05"]["dates"][0]["computed_at"] == "2026-11-05"


@pytest.mark.parametrize("changes", [{"age_band": "minor"}, {"entry_purpose": "other"}, {"migration_basis": "rvp"}])
def test_prototype_does_not_bypass_unsupported_profiles(changes):
    medical = tasks(profile(**changes), True)["M05"]
    assert medical["engine_status"] == "needs_review"
    assert medical["dates"][0]["computed_at"] is None


def test_missing_anchor_is_not_fabricated_and_unknown_answers_remain_unknown():
    result = tasks(profile(entry_at=None, arrival_at=None, visa_expiry=None, citizenship=None), True)
    assert result["M05"]["dates"][0]["computed_at"] is None
    assert "citizenship" in result["M05"]["missing_fields"]
    assert all(d["computed_at"] is None for d in result["M07"]["dates"])


def test_working_calendar_and_anniversary_are_explicit_demo_conventions():
    assert prototype_date({"unit": "working", "offset": 2}, "2026-10-16") == "2026-10-20"
    assert prototype_date({"unit": "working", "offset": 1}, "2026-12-31") == "2027-01-01"
    assert prototype_date({"prototype_formula": "next_weekday"}, "2026-10-16") == "2026-10-19"
    assert prototype_date({"prototype_formula": "anniversary_plus_30"}, "2024-02-29") == "2025-03-30"
    repeat = tasks(profile(last_medical_completed_at="2025-10-05"), True)["M10"]
    assert repeat["dates"][0]["computed_at"] == "2026-11-04"


def test_published_rules_are_not_mutated():
    rules = seed_rules()
    original = deepcopy(rules)
    build_roadmap("test", profile(), [], rules, prototype_timing=True)
    assert rules == original


def test_preview_setting_is_explicit_and_isolated_between_apps(tmp_path):
    with pytest.raises(ValueError, match="requires demo_mode"):
        create_app(Settings(_env_file=None, prototype_timing=True, database_path=str(tmp_path / "invalid.db")))
    for enabled in (True, False):
        settings = Settings(_env_file=None, demo_mode=True, prototype_timing=enabled, database_path=str(tmp_path / f"{enabled}.db"), bot_transport="disabled")
        with TestClient(create_app(settings)) as client:
            assert client.get("/api/config").json()["prototype_timing"] is enabled
            headers, _ = student(client)
            roadmap = client.get("/api/me/roadmap", headers=headers).json()
            medical = next(t for t in roadmap["tasks"] if t["family"] == "M05")
            assert bool(medical["dates"][0]["computed_at"]) is enabled
            assert bool(medical["prototype_timing"]) is enabled

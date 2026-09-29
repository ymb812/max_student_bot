import pytest
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app


@pytest.fixture
def client(tmp_path):
    settings = Settings(
        _env_file=None,
        database_path=str(tmp_path / "test.sqlite3"),
        demo_mode=True,
        editor_sutd_key="test-sutd",
        editor_leti_key="test-leti",
        max_bot_token="test-bot-token",
        bot_transport="disabled",
    )
    with TestClient(create_app(settings)) as client:
        yield client


def student(client, university="sutd", **changes):
    auth = client.post("/api/auth/demo").json()
    headers = {"Authorization": "Bearer " + auth["access_token"]}
    profile = client.get("/api/me/profile", headers=headers).json()
    profile.update(
        university_id=university,
        consent=True,
        age_band="adult",
        migration_basis="study",
        study_status="active",
        entry_purpose="study",
        citizenship="Test country",
        stay_over_90_days=True,
        residence_type="dorm",
        visa_regime="visa",
        entry_at="2026-09-01",
        visa_expiry="2026-12-01",
        registration_expiry="2026-12-01",
        fingerprinting_completed=False,
    )
    profile.update(changes)
    response = client.patch("/api/me/profile", headers=headers, json=profile)
    assert response.status_code == 200, response.text
    return headers, profile


def editor(client, tenant="sutd"):
    return {
        "Authorization": "Bearer "
        + client.post("/api/auth/editor", json={"key": "test-" + tenant}).json()[
            "access_token"
        ]
    }


def draft(**changes):
    value = {
        "rule_id": "demo.sutd.preparation",
        "family": "M07",
        "semantic_action_key": "demo.check_package",
        "title_i18n": {"ru": "Демо: проверить комплект", "en": "Demo: check documents"},
        "action_i18n": {
            "ru": "Проверьте комплект в офисе",
            "en": "Check the documents with the office",
        },
        "documents_i18n": {"ru": ["Уточнить в офисе"], "en": ["Ask the office"]},
        "contact": "Модельный офис",
        "eligibility_predicate": {"visa_regime": "visa"},
        "trigger_types": [],
        "deadline_specs": [
            {
                "kind": "preparation_start",
                "owner": "university",
                "required_or_recommended": "recommended_by_university",
                "anchor_field": "visa_expiry",
                "offset": -65,
                "unit": "calendar",
                "literal": {
                    "ru": "Демо: начать за 65 дней",
                    "en": "Demo: start 65 days before expiry",
                },
            }
        ],
        "source_type": "demo_model",
        "source_url": "https://example.org/demo",
        "source_title": "Модельная инструкция",
        "checked_at": "2026-09-27",
        "effective_from": "2026-09-27",
        "evidence_note": "Демонстрационное изменение университетского правила",
    }
    value.update(changes)
    return value

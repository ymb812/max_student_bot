from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.timeutil import MSK, moscow_today


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Profile(StrictModel):
    university_id: Literal["sutd", "leti"] | None = None
    campus_id: Literal["main", "vshte", "other"] = "main"
    language: Literal["ru", "en"] = "ru"
    age_band: Literal["adult", "minor", "unknown"] = "unknown"
    citizenship: str | None = Field(default=None, min_length=2, max_length=60)
    visa_regime: Literal["visa", "visa_free", "unknown"] = "unknown"
    migration_basis: Literal["study", "rvpo", "rvp", "residence_permit", "unknown"] = (
        "unknown"
    )
    study_status: Literal[
        "active", "leave", "transferred", "expelled", "graduated", "working", "unknown"
    ] = "unknown"
    study_form: Literal["full_time", "part_time", "unknown"] = "unknown"
    stay_over_90_days: bool | None = None
    residence_type: Literal["dorm", "private", "other", "unknown"] = "unknown"
    planned_entry: date | None = None
    education_start: date | None = None
    entry_at: date | None = None
    arrival_at: datetime | None = None
    entry_purpose: Literal["study", "other", "unknown"] = "unknown"
    visa_expiry: date | None = None
    registration_expiry: date | None = None
    stay_expiry: date | None = None
    last_medical_completed_at: date | None = None
    fingerprinting_completed: bool | None = None
    consent: bool = False
    reminders_enabled: bool = True

    @model_validator(mode="after")
    def consistent(self):
        if self.arrival_at and self.arrival_at.tzinfo is None:
            raise ValueError("arrival_at requires a timezone")
        if self.visa_regime == "visa_free" and self.visa_expiry:
            raise ValueError("visa_expiry is only allowed in the visa branch")
        for value in (self.entry_at, self.last_medical_completed_at):
            if value and value > moscow_today():
                raise ValueError("A completed event cannot be in the future")
        return self


EventType = Literal[
    "entry_recorded",
    "reentry_recorded",
    "address_changed",
    "hotel_stay_started",
    "hotel_stay_ended",
    "visa_issued",
    "registration_confirmed",
    "medical_completed",
    "fingerprinting_completed",
    "passport_replaced",
    "status_changed",
    "enrolment_changed",
]


class EventPayload(StrictModel):
    residence_type: Literal["dorm", "private", "other"] | None = None
    from_residence_type: Literal["dorm", "private", "other", "unknown"] | None = None
    entry_purpose: Literal["study", "other", "unknown"] | None = None
    visa_regime: Literal["visa", "visa_free", "unknown"] | None = None
    arrival_at: datetime | None = None
    visa_expiry: date | None = None
    registration_expiry: date | None = None
    stay_expiry: date | None = None
    status: (
        Literal[
            "study",
            "rvpo",
            "rvp",
            "residence_permit",
            "unknown",
            "active",
            "leave",
            "transferred",
            "expelled",
            "graduated",
            "working",
        ]
        | None
    ) = None


class EventInput(StrictModel):
    type: EventType
    occurred_at: date
    payload: EventPayload = Field(default_factory=EventPayload)
    idempotency_key: str = Field(min_length=8, max_length=120)
    confirmed: Literal[True]
    supersedes_event_id: str | None = None

    @model_validator(mode="after")
    def check_payload(self):
        if self.occurred_at > moscow_today():
            raise ValueError("A completed event cannot be in the future")
        required = {
            "entry_recorded": ["entry_purpose", "residence_type", "visa_regime"],
            "reentry_recorded": ["entry_purpose", "residence_type", "visa_regime"],
            "address_changed": ["from_residence_type", "residence_type"],
            "visa_issued": ["visa_expiry"],
            "registration_confirmed": ["residence_type", "registration_expiry"],
            "status_changed": ["status"],
            "enrolment_changed": ["status"],
        }.get(self.type, [])
        if any(getattr(self.payload, k) is None for k in required):
            raise ValueError("Missing fields: " + ", ".join(required))
        allowed = set(required)
        if self.type in ("entry_recorded", "reentry_recorded"):
            allowed |= {"arrival_at"}
        if self.type == "registration_confirmed":
            allowed |= {"stay_expiry"}
        supplied = self.payload.model_dump(exclude_none=True)
        if set(supplied) - allowed:
            raise ValueError("Fields do not belong to this event type")
        if self.type == "status_changed" and self.payload.status not in (
            "study",
            "rvpo",
            "rvp",
            "residence_permit",
            "unknown",
        ):
            raise ValueError("Invalid migration status")
        if self.type == "enrolment_changed" and self.payload.status not in (
            "active",
            "leave",
            "transferred",
            "expelled",
            "graduated",
            "working",
            "unknown",
        ):
            raise ValueError("Invalid study status")
        if self.payload.arrival_at and self.payload.arrival_at.tzinfo is None:
            raise ValueError("arrival_at requires timezone")
        if (
            self.payload.arrival_at
            and self.payload.arrival_at.astimezone(MSK).date() != self.occurred_at
        ):
            raise ValueError("arrival_at must match occurred_at")
        expiry = self.payload.visa_expiry or self.payload.registration_expiry
        if expiry and expiry < self.occurred_at:
            raise ValueError("Document expiry must not precede issuance")
        return self


class DeadlineSpec(StrictModel):
    kind: Literal[
        "legal_deadline",
        "university_submission_deadline",
        "preparation_start",
        "document_expiry",
    ]
    owner: Literal["state", "university", "product", "user"]
    required_or_recommended: Literal[
        "required",
        "recommended_by_university",
        "product_sorting",
        "unspecified",
        "document_fact",
    ]
    anchor_field: Literal[
        "entry_at",
        "arrival_at",
        "education_start",
        "visa_expiry",
        "registration_expiry",
        "stay_expiry",
        "last_medical_completed_at",
        "occurred_at",
    ]
    offset: int | None = Field(default=None, ge=-366, le=366)
    unit: Literal["calendar", "working", "hours", "unspecified"]
    literal: dict[Literal["ru", "en"], str]
    absolute_date: date | None = None
    uncertainty: str = ""


class RuleDraft(StrictModel):
    rule_id: str = Field(pattern=r"^[a-zA-Z0-9_.-]{3,80}$")
    family: Literal[
        "M01", "M02", "M03", "M04", "M05", "M06", "M07", "M08", "M09", "M10"
    ]
    semantic_action_key: str = Field(min_length=3, max_length=80)
    action_i18n: dict[Literal["ru", "en"], str]
    title_i18n: dict[Literal["ru", "en"], str]
    documents_i18n: dict[Literal["ru", "en"], list[str]]
    contact: str = Field(min_length=3, max_length=500)
    eligibility_predicate: dict[str, str | bool] = Field(default_factory=dict)
    trigger_types: list[EventType] = Field(default_factory=list)
    deadline_specs: list[DeadlineSpec] = Field(default_factory=list, max_length=4)
    source_type: Literal["public_official", "employee_confirmed", "demo_model"] = (
        "demo_model"
    )
    source_url: str = Field(min_length=8, max_length=500)
    source_title: str = Field(min_length=3, max_length=300)
    checked_at: date
    effective_from: date
    evidence_note: str = Field(min_length=3, max_length=1000)


class AuthRequest(StrictModel):
    init_data: str = Field(max_length=12000)


class EditorLogin(StrictModel):
    key: str = Field(max_length=200)


class TaskStatus(StrictModel):
    status: Literal["not_started", "in_progress", "completed"]


class PublicationRequest(StrictModel):
    confirmed: Literal[True]
    preview_token: str
    idempotency_key: str = Field(min_length=8, max_length=120)


class TextRequest(StrictModel):
    text: str = Field(min_length=2, max_length=1500)


class CandidateConfirm(StrictModel):
    occurred_at: date
    payload: EventPayload
    idempotency_key: str = Field(min_length=8, max_length=120)
    confirmed: Literal[True]

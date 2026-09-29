"""Public response shapes used by OpenAPI and runtime response validation."""

from typing import Any, Literal
from pydantic import BaseModel, ConfigDict


class OpenResponse(BaseModel):
    model_config = ConfigDict(extra="allow")


class AuthResponse(OpenResponse):
    access_token: str
    token_type: str
    role: Literal["student", "university_editor", "maintainer"]
    tenant: str | None
    demo_model: bool


class TaskResponse(OpenResponse):
    task_key: str
    rule_id: str
    rule_version: int
    family: str
    episode_id: str
    cycle_id: str
    semantic_action_key: str
    title_i18n: dict[str, str]
    action_i18n: dict[str, str]
    documents_i18n: dict[str, list[str]]
    contact: str
    dates: list[dict[str, Any]]
    source_snapshot: list[dict[str, Any]]
    eligibility_decision: bool | Literal["unknown"]
    engine_status: Literal[
        "actionable", "conditional", "needs_review", "requires_recheck", "superseded"
    ]
    user_status: Literal["not_started", "in_progress", "completed"]
    completed_at: str | None
    priority_bucket: Literal["now", "soon", "later"]
    demo_model: bool


class RoadmapResponse(OpenResponse):
    tasks: list[TaskResponse]
    decisions: list[dict[str, Any]]
    effective_profile: dict[str, Any]
    timezone: str
    demo_model: bool


class EventResponse(OpenResponse):
    event_id: str
    created: bool
    verification: Literal["user_attested"]
    revision_id: str | None = None


class RulesResponse(OpenResponse):
    rules: list[dict[str, Any]]
    tenant: str | None
    role: str
    demo_model: bool


class PreviewResponse(OpenResponse):
    affected_count: int
    affected: list[dict[str, Any]]
    preview_token: str

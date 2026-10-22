"""Stable public error codes; legacy detail remains compatible with API clients."""
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException
import json


CODES = {
    "Result predates the current episode": "result_predates_episode",
    "This result is not available; refresh the roadmap": "result_unavailable",
    "Result already recorded; correct it in history": "result_already_recorded",
    "City arrival cannot precede the current entry": "city_before_entry",
    "City arrival must follow entry and cannot be in the future": "city_date_invalid",
    "City arrival must be on/after entry and not in the future": "city_date_invalid",
    "A completed event cannot be in the future": "future_fact",
    "A reported result cannot be in the future": "future_fact",
    "Document expiry must not precede receipt": "expiry_before_receipt",
    "Document expiry must not precede issuance": "expiry_before_issuance",
    "Confirm all three trip checks": "trip_checks",
    "Invalid remaining documents": "remaining_documents",
    "Invalid document position": "remaining_documents",
    "Outcome does not belong to this process": "invalid_outcome",
    "Expiry belongs only to a received document": "expiry_requires_receipt",
    "Preparation belongs to a past journey": "past_journey",
    "An arrived context is required": "arrived_required",
    "Post-arrival results need an arrived context": "arrived_required",
    "Onboarding is already saved; use targeted profile or result updates": "onboarding_saved",
    "Complete onboarding first": "onboarding_required",
    "University transfer requires an office review; use enrolment_changed": "transfer_review",
    "Use profile deletion to withdraw consent": "consent_withdrawal",
    "Only an active owned result may be corrected": "correction_inactive",
    "Only an active owned event can be corrected": "correction_inactive",
    "Event already corrected; correct its replacement": "correction_inactive",
    "Retract the replacement first": "retract_replacement",
    "Retract the replacement event first": "retract_replacement",
    "Use a concrete process result instead of a generic status": "use_result",
    "This task has been superseded": "superseded_task",
    "visa_expiry is only allowed in the visa branch": "visa_branch",
    "Visa preparation requires the visa branch": "visa_branch",
    "A planned first arrival cannot include a completed entry": "planned_entry_conflict",
    "Consent and university are required": "consent_required",
}


def code_for(detail):
    if not isinstance(detail, str):
        return "fields_invalid"
    text = detail.removeprefix("Value error, ")
    if text.startswith("Idempotency key"):
        return "idempotency_conflict"
    if text.startswith("Missing fields:"):
        return "missing_fields"
    return CODES.get(text, "fields_invalid")


def install_error_handlers(app):
    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        return JSONResponse(status_code=exc.status_code, headers=exc.headers,
                            content={"detail": exc.detail, "error_code": code_for(exc.detail) if exc.status_code in (409, 422) else None})

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        response = await request_validation_exception_handler(request, exc)
        body = json.loads(response.body)
        body["errors"] = [{"field": list(e["loc"]), "code": "missing_fields" if e["type"] == "missing" else code_for(e["msg"])} for e in exc.errors()]
        return JSONResponse(status_code=422, content=body)

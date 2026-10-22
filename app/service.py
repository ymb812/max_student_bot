import hashlib
import json
import uuid
from datetime import date, datetime, timezone
from fastapi import HTTPException
from app.db import dumps
from app.engine import build_roadmap
from app.models import Profile
from app.timeutil import moscow_today


def uid():
    return uuid.uuid4().hex


def stamp():
    return datetime.now(timezone.utc).isoformat()


def events_for(db, user_id):
    return [
        {
            **dict(r),
            "payload": json.loads(r["payload"]),
            "source": "user",
            "verification": "user_attested",
            "schema_version": 1,
            "user_confirmation_status": "confirmed",
            "episode_id": r["id"],
        }
        for r in db.execute(
            "SELECT * FROM events WHERE user_id=? ORDER BY occurred_at,recorded_at,id",
            (user_id,),
        )
    ]


def reports_for(db, user_id):
    return [{**dict(r), "body": json.loads(r["body"]), "dependencies": json.loads(r["dependencies"]),
             "verification": "user_attested"} for r in db.execute(
        "SELECT * FROM workflow_reports WHERE user_id=? ORDER BY recorded_at,id", (user_id,))]


def rules_for(db, tenant, override=None):
    rules = [
        json.loads(r["body"])
        for r in db.execute(
            "SELECT body FROM rules WHERE tenant=? AND status='published'", (tenant,)
        )
    ]
    if override:
        rules = [r for r in rules if r["rule_id"] != override["rule_id"]] + [override]
    # A future effective version does not retire the current version until active.
    today = moscow_today().isoformat()
    selected = {}
    for rule in rules:
        if rule["effective_from"] <= today and (
            rule["rule_id"] not in selected
            or rule["version"] > selected[rule["rule_id"]]["version"]
        ):
            selected[rule["rule_id"]] = rule
    return list(selected.values())


def snapshot(db, user_id, override=None):
    user = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not user:
        raise HTTPException(404, "Profile not found")
    profile = json.loads(user["profile"])
    return build_roadmap(
        user_id,
        profile,
        events_for(db, user_id),
        rules_for(db, profile.get("university_id"), override),
        reports=reports_for(db, user_id),
        prototype_timing=getattr(db, "prototype_timing", False),
    )


def plan_diff(db, user_id, calculated):
    old = {
        r["task_key"]: {
            **json.loads(r["body"]),
            "user_status": r["user_status"],
            "completed_at": r["completed_at"],
        }
        for r in db.execute("SELECT * FROM tasks WHERE user_id=?", (user_id,))
    }
    desired = {}
    changes = []
    for task in calculated["tasks"]:
        key = task["task_key"]
        previous = old.get(key)
        task = {
            **task,
            "user_status": previous["user_status"] if previous else "not_started",
            "completed_at": previous.get("completed_at") if previous else None,
        }
        auto = task.pop("auto_completed", False)
        if auto:
            task["completion_basis"] = "reported_fact"
            task["user_status_before_auto"] = (
                previous.get("user_status_before_auto", previous["user_status"])
                if previous
                else "not_started"
            )
            task["completed_at_before_auto"] = (
                previous.get("completed_at_before_auto", previous.get("completed_at"))
                if previous
                else None
            )
            task["user_status"] = "completed"
            task["completed_at"] = task["completed_at"] or stamp()
        elif previous and previous.get("completion_basis") == "reported_fact":
            task["user_status"] = previous.get("user_status_before_auto", "not_started")
            task["completed_at"] = previous.get("completed_at_before_auto")
        if task.get("result_report_id") and task.get("workflow_status") in ("waiting", "partial", "needs_help"):
            task["user_status"] = "in_progress"
            task["completed_at"] = None
        if task.get("process") and task["user_status"] == "completed" and not auto:
            # A legacy manual completion means exactly the old action, not document receipt.
            task["workflow_status"] = "completed"
        desired[key] = task
        if previous != task:
            changes.append({"task_key": key, "before": previous, "after": task})
    f = calculated["facts"]
    for key, previous in old.items():
        if key in desired:
            continue
        status = (
            "requires_recheck"
            if (
                previous["family"] == "M04"
                and (previous["user_status"] == "completed" or previous.get("document_previously_known"))
                and previous["episode_id"] in f["_episodes"]
                and previous["episode_id"] != f["_residence_episode"]
                and not f["_registration_confirmed"]
            )
            else "superseded"
        )
        updated = {**previous, "engine_status": status}
        if previous.get("process"):
            updated["result_actions"] = []
        for receipt in f.get("_report_receipts", []):
            if receipt["task_key"] == key:
                updated.update(completion_basis="reported_fact", user_status="completed", workflow_status="completed",
                               result_report_id=receipt["id"], completed_at=previous.get("completed_at") or receipt["recorded_at"],
                               user_status_before_auto=previous.get("user_status_before_auto", previous["user_status"]),
                               completed_at_before_auto=previous.get("completed_at_before_auto", previous.get("completed_at")))
        issuance = f.get("_visa_issued_event") if previous["family"] == "M07" else f.get("_registration_issued_event") if previous["family"] == "M08" else None
        current_cycle = f["_visa_cycle"] if previous["family"] == "M07" else f["_registration_cycle"]
        if issuance and previous["cycle_id"] != current_cycle and previous["engine_status"] != "superseded" and previous.get("availability", "available") == "available":
            updated.update(completion_basis="reported_fact", user_status="completed", workflow_status="completed",
                           completed_at=previous.get("completed_at") or stamp(),
                           user_status_before_auto=previous.get("user_status_before_auto", previous["user_status"]),
                           completed_at_before_auto=previous.get("completed_at_before_auto", previous.get("completed_at")))
        medical_report = f["_medical_reported"]
        closes_initial = (
            medical_report
            and previous["family"] == "M05"
            and f.get("entry_at")
            and f["last_medical_completed_at"] >= f["entry_at"]
        )
        previous_medical = f["_medical_cycles"].get(previous["cycle_id"])
        closes_cycle = (
            medical_report
            and previous["family"] == "M10"
            and previous_medical
            and previous["cycle_id"] != f["_medical_cycle"]
            and previous_medical <= f["last_medical_completed_at"]
        )
        if medical_report and (closes_initial or closes_cycle):
            updated["completion_basis"] = "reported_fact"
            updated["user_status_before_auto"] = previous.get(
                "user_status_before_auto", previous["user_status"]
            )
            updated["completed_at_before_auto"] = previous.get(
                "completed_at_before_auto", previous.get("completed_at")
            )
            updated["user_status"] = "completed"
            updated["completed_at"] = previous.get("completed_at") or stamp()
        orphaned = f.get("_workflow", {}).get(key)
        if orphaned and not orphaned["dependencies_valid"]:
            updated.update(engine_status="requires_recheck", workflow_status="needs_help", availability="available",
                           result_report_id=orphaned["id"], result_actions=[],
                           availability_reason_i18n={"ru": "Основание этого результата отменено или исправлено. Проверьте запись в истории и подтвердите актуальный документ в текущем цикле.",
                                                     "en": "The basis of this result was retracted or corrected. Review its history and confirm your current document in the current cycle."})
        # Do not overwrite source/version/history of completed tasks from an earlier episode.
        desired[key] = updated
        if previous != updated:
            changes.append({"task_key": key, "before": previous, "after": updated})
    return list(desired.values()), changes


PROCESS_OUTCOMES = {
    "invitation": {"requested", "received"}, "initial_visa": {"submitted", "received"},
    "trip": {"completed"}, "documents": {"completed", "question"},
    "office": {"partial", "completed"}, "registration": {"submitted", "received"},
    "visa_renewal": {"submitted", "received"}, "registration_renewal": {"submitted", "received"},
    "consultation": set(),
}


def record_result(db, user_id, task_key, result, *, initial=False, recalc=True):
    body = result.model_dump(mode="json")
    previous = db.execute("SELECT * FROM workflow_reports WHERE user_id=? AND idempotency_key=?", (user_id, result.idempotency_key)).fetchone()
    if previous:
        saved = json.loads(previous["body"])
        if previous["task_key"] != task_key or saved["request"] != body:
            raise HTTPException(409, "Idempotency key was used for another result")
        return previous["id"], False
    calculated = snapshot(db, user_id)
    task = next((t for t in calculated["tasks"] if t["task_key"] == task_key), None)
    original = None
    if result.supersedes_report_id:
        original = db.execute("SELECT * FROM workflow_reports WHERE id=? AND user_id=?", (result.supersedes_report_id, user_id)).fetchone()
        if not original or original["retracted_at"] or original["task_key"] != task_key or db.execute("SELECT id FROM workflow_reports WHERE supersedes_report_id=? AND retracted_at IS NULL", (original["id"],)).fetchone():
            raise HTTPException(409, "Only an active owned result may be corrected")
        if task is None:
            row = db.execute("SELECT body FROM tasks WHERE task_key=? AND user_id=?", (task_key, user_id)).fetchone()
            task = json.loads(row["body"]) if row else None
    if not task or not task.get("process"):
        raise HTTPException(404, "Current process not found")
    process = task["process"]
    if result.outcome not in PROCESS_OUTCOMES.get(process, set()) | {"question_sent", "clarified"}:
        raise HTTPException(422, "Outcome does not belong to this process")
    if result.document_expiry and (process not in ("initial_visa", "visa_renewal", "registration", "registration_renewal") or result.outcome != "received"):
        raise HTTPException(422, "Expiry belongs only to a received document")
    if process == "trip" and result.outcome == "completed" and set(result.checklist) != {"documents", "arrival", "housing"}:
        raise HTTPException(422, "Confirm all three trip checks")
    if result.checklist and process != "trip":
        raise HTTPException(422, "Trip checklist does not belong to this process")
    if result.occurred_at and process in ("documents", "office", "registration", "registration_renewal") and not original:
        anchor = calculated["facts"].get("_residence_anchor")
        if anchor and str(result.occurred_at) < str(anchor)[:10]:
            raise HTTPException(422, "Result predates the current episode")
    if result.missing_documents and (process != "office" or result.outcome != "partial" or any(i >= len(task["documents_i18n"]["ru"]) for i in result.missing_documents)):
        raise HTTPException(422, "Invalid remaining documents")
    if not initial and not original:
        if task.get("auto_completed"):
            raise HTTPException(409, "Result already recorded; correct it in history")
        external = result.external_result and result.outcome in ("requested", "submitted", "received", "completed", "partial")
        if not external and result.outcome not in task.get("result_actions", []):
            raise HTTPException(409, "This result is not available; refresh the roadmap")
        if external and task.get("availability") == "past":
            raise HTTPException(409, "Preparation belongs to a past journey")
        if external and process in ("documents", "office", "registration", "registration_renewal") and not (calculated["facts"].get("entry_at") or calculated["facts"].get("arrival_status") == "arrived"):
            raise HTTPException(409, "An arrived context is required")
    dependencies = [] if result.external_result or initial else task.get("dependency_report_ids", [])
    stored_body = {**body, "request": body, "provenance": "onboarding_self_report" if initial else "student_self_report"}
    facts = calculated["facts"]
    stored_body["basis_cycle"] = facts["_visa_cycle"] if process in ("initial_visa", "visa_renewal") else facts["_registration_cycle"]
    if original:
        stored_body["basis_cycle"] = json.loads(original["body"])["basis_cycle"]
        dependencies = json.loads(original["dependencies"])
    rid = uid()
    db.execute("INSERT INTO workflow_reports VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
        rid, user_id, task_key, process, task["episode_id"], task["cycle_id"], result.outcome,
        str(result.occurred_at) if result.occurred_at else None, stamp(), dumps(stored_body), dumps(dependencies),
        result.idempotency_key, result.supersedes_report_id, None))
    if recalc:
        recalculate(db, user_id, "result_corrected" if original else "result_reported", rid, force_revision=True)
    return rid, True


def initialize_route(db, user_id, request):
    from app.models import WorkflowResult
    body = request.model_dump(mode="json")
    receipt = db.execute("SELECT * FROM onboarding_receipts WHERE user_id=? AND idempotency_key=?", (user_id, request.idempotency_key)).fetchone()
    if receipt:
        if json.loads(receipt["body"]) != body:
            raise HTTPException(409, "Idempotency key was used for another onboarding")
        return receipt["revision_id"], False
    old = json.loads(db.execute("SELECT profile FROM users WHERE id=?", (user_id,)).fetchone()["profile"])
    if old.get("consent"):
        raise HTTPException(409, "Onboarding is already saved; use targeted profile or result updates")
    stored_profile = {**body["profile"], "preparation_state": "not_started" if request.preparation == "not_started" else "unknown"}
    db.execute("UPDATE users SET profile=?,updated_at=? WHERE id=?", (dumps(stored_profile), stamp(), user_id))
    initial_results = []
    if request.preparation in ("requested", "invitation_received"):
        initial_results.append(("invitation", "requested" if request.preparation == "requested" else "received"))
    if request.preparation in ("visa_submitted", "visa_received"):
        initial_results.append(("initial_visa", "submitted" if request.preparation == "visa_submitted" else "received"))
    if request.office_package in ("partial", "completed"):
        initial_results.append(("office", request.office_package))
    if request.registration in ("submitted", "received"):
        initial_results.append(("registration", request.registration))
    for process, outcome in initial_results:
        task = next(t for t in snapshot(db, user_id)["tasks"] if t.get("process") == process)
        expiry = request.profile.visa_expiry if process == "initial_visa" else request.profile.registration_expiry if process == "registration" else None
        record_result(db, user_id, task["task_key"], WorkflowResult(outcome=outcome,
            document_expiry=expiry if outcome == "received" else None, external_result=True, confirmed=True,
            idempotency_key="onboarding-" + hashlib.sha256((request.idempotency_key + ":" + process).encode()).hexdigest()), initial=True, recalc=False)
    revision = recalculate(db, user_id, "onboarding_confirmed", request.idempotency_key, force_revision=True)
    db.execute("INSERT INTO onboarding_receipts VALUES(?,?,?,?)", (user_id, request.idempotency_key, dumps(body), revision))
    return revision, True


def enqueue(db, user_id, key, body):
    db.execute(
        "INSERT OR IGNORE INTO outbox(id,user_id,dedupe_key,body,status) VALUES(?,?,?,?,?)",
        (uid(), user_id, key, dumps(body), "pending"),
    )


def recalculate(db, user_id, reason, trigger_id=None, notify=True, force_revision=False):
    calculated = snapshot(db, user_id)
    tasks, changes = plan_diff(db, user_id, calculated)
    if not changes and not force_revision:
        return None
    if reason == "time_refresh" and any(
        c["before"] is None or c["before"]["rule_version"] != c["after"]["rule_version"]
        for c in changes
    ):
        # Future versions become effective without an editor publishing them twice.
        reason, notify = "rule_effective", True
    revision_id = uid()
    for task in tasks:
        user_status, completed = task["user_status"], task["completed_at"]
        body = {
            k: v for k, v in task.items() if k not in ("user_status", "completed_at")
        }
        db.execute(
            "INSERT OR REPLACE INTO tasks VALUES(?,?,?,?,?)",
            (task["task_key"], user_id, dumps(body), user_status, completed),
        )
    db.execute(
        "INSERT INTO revisions VALUES(?,?,?,?,?,?)",
        (revision_id, user_id, reason, trigger_id, stamp(), dumps(changes)),
    )
    user = db.execute(
        "SELECT max_user_id,profile FROM users WHERE id=?", (user_id,)
    ).fetchone()
    if notify and changes and user["max_user_id"]:
        profile = json.loads(user["profile"])
        if profile["consent"]:
            enqueue(
                db,
                user_id,
                f"{trigger_id or reason}:{user_id}:{revision_id}",
                {
                    "kind": "roadmap_changed",
                    "revision_id": revision_id,
                    "reason": reason,
                    "changed_count": len(changes),
                    "language": profile["language"],
                    "task_key": changes[0]["task_key"],
                    "demo_model": any(c["after"].get("demo_model") for c in changes),
                    "changes": [
                        {
                            "title_i18n": c["after"]["title_i18n"],
                            "engine_status": c["after"]["engine_status"],
                            "owners": sorted({d["owner"] for d in c["after"]["dates"]}),
                            "timing": next(
                                (
                                    d
                                    for d in c["after"]["dates"]
                                    if d["kind"] != "document_expiry"
                                ),
                                None,
                            ),
                            "date": next(
                                (
                                    d["computed_at"]
                                    for d in c["after"]["dates"]
                                    if d["computed_at"]
                                    and d["kind"] != "document_expiry"
                                ),
                                None,
                            ),
                        }
                        for c in changes[:4]
                    ],
                },
            )
    return revision_id


def record_event(db, user_id, event):
    body = event.model_dump(mode="json")
    body["payload"] = event.payload.model_dump(mode="json", exclude_none=True)
    existing = db.execute(
        "SELECT * FROM events WHERE user_id=? AND idempotency_key=?",
        (user_id, event.idempotency_key),
    ).fetchone()
    if existing:
        if (
            existing["type"] != event.type
            or existing["occurred_at"] != str(event.occurred_at)
            or json.loads(existing["payload"]) != body["payload"]
            or existing["supersedes_event_id"] != event.supersedes_event_id
        ):
            raise HTTPException(409, "Idempotency key was used for another event")
        return existing["id"], False
    if event.supersedes_event_id:
        original = db.execute(
            "SELECT * FROM events WHERE id=? AND user_id=?",
            (event.supersedes_event_id, user_id),
        ).fetchone()
        if not original or original["retracted_at"]:
            raise HTTPException(409, "Only an active owned event can be corrected")
        if original["type"] != event.type:
            raise HTTPException(422, "Correction must retain the event type")
        if db.execute(
            "SELECT id FROM events WHERE supersedes_event_id=? AND retracted_at IS NULL",
            (event.supersedes_event_id,),
        ).fetchone():
            raise HTTPException(409, "Event already corrected; correct its replacement")
    profile = json.loads(
        db.execute("SELECT profile FROM users WHERE id=?", (user_id,)).fetchone()[
            "profile"
        ]
    )
    if not profile["consent"] or not profile.get("university_id"):
        raise HTTPException(409, "Complete onboarding first")
    eid = uid()
    db.execute(
        "INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?)",
        (
            eid,
            user_id,
            event.type,
            str(event.occurred_at),
            stamp(),
            dumps(body["payload"]),
            event.idempotency_key,
            event.supersedes_event_id,
            None,
        ),
    )
    recalculate(
        db, user_id, "event_corrected" if event.supersedes_event_id else event.type, eid,
        force_revision=True
    )
    return eid, True


def validate_rule(draft):
    errors = []
    protected = {"M05", "M06", "M10"}
    if draft.family in protected:
        errors.append(
            "Federal medical/biometric eligibility cannot be edited by a university"
        )
    if not draft.source_url.startswith("https://"):
        errors.append("Use an HTTPS source URL")
    for field in ("action_i18n", "title_i18n", "documents_i18n"):
        content = getattr(draft, field)
        if set(content) != {"ru", "en"} or not all(content.values()):
            errors.append(f"{field} requires nonempty ru and en")
    allowed_fields = {
        "visa_regime",
        "residence_type",
        "study_form",
        "study_status",
        "campus_id",
        "migration_basis",
        "age_band",
        "stay_over_90_days",
        "citizenship",
    }
    test = Profile().model_dump()
    for field, value in draft.eligibility_predicate.items():
        if field not in allowed_fields:
            errors.append(f"Unsupported predicate: {field}")
            continue
        try:
            Profile.model_validate({**test, field: value})
        except ValueError:
            errors.append(f"Invalid predicate value: {field}")
    for spec in draft.deadline_specs:
        if set(spec.literal) != {"ru", "en"} or not all(spec.literal.values()):
            errors.append("Deadline text requires nonempty ru and en")
        if (
            spec.kind == "legal_deadline"
            or spec.owner in ("state", "user")
            or spec.kind == "document_expiry"
        ):
            errors.append(
                "University rules cannot edit legal deadlines or document facts"
            )
        if spec.unit == "working":
            errors.append(
                "Verified working-day calendar is not configured; use a literal with unspecified unit"
            )
        if spec.unit == "hours":
            errors.append(
                "Verified office schedule is not configured; use a literal with unspecified unit"
            )
        if spec.unit == "unspecified" and (
            spec.offset is not None or spec.absolute_date is not None
        ):
            errors.append("Unspecified units must not have a computable formula")
        if (
            spec.unit == "calendar"
            and spec.offset is None
            and spec.absolute_date is None
        ):
            errors.append("Calendar deadline needs offset or absolute date")
        if spec.owner == "product":
            errors.append("University editor cannot add a product buffer")
    if draft.checked_at > moscow_today():
        errors.append("checked_at cannot be in the future")
    return errors


def simulate_rule(record):
    """Synthetic fixtures for validation only; never create a demo student."""
    from app.models import EventInput

    now = moscow_today().isoformat()
    base = Profile(
        university_id=record["university_id"],
        consent=True,
        age_band="adult",
        migration_basis="study",
        study_status="active",
        visa_regime="visa",
        residence_type="dorm",
        entry_at=now,
        entry_purpose="study",
        visa_expiry="2030-12-01",
        registration_expiry="2030-12-01",
        education_start="2030-09-01",
    ).model_dump(mode="json")
    payloads = {
        "entry_recorded": dict(
            residence_type="dorm", entry_purpose="study", visa_regime="visa"
        ),
        "reentry_recorded": dict(
            residence_type="dorm", entry_purpose="study", visa_regime="visa"
        ),
        "address_changed": dict(from_residence_type="dorm", residence_type="private"),
        "visa_issued": dict(visa_expiry="2030-12-01"),
        "registration_confirmed": dict(
            residence_type="dorm", registration_expiry="2030-12-01"
        ),
        "status_changed": dict(status="study"),
        "enrolment_changed": dict(status="active"),
    }
    samples, events = [], []
    if record["trigger_types"]:
        typ = record["trigger_types"][0]
        event = EventInput(
            type=typ,
            occurred_at=now,
            payload=payloads.get(typ, {}),
            confirmed=True,
            idempotency_key="simulation-event",
        ).model_dump(mode="json")
        event.update(id="simulation-event", recorded_at=stamp())
        event["payload"] = {k: v for k, v in event["payload"].items() if v is not None}
        events = [event]
    for kind in ("applicable", "non_applicable", "unknown"):
        facts = {**base}
        test_events = json.loads(dumps(events))
        for k, value in record["eligibility_predicate"].items():
            facts[k] = (
                value
                if kind == "applicable"
                else (
                    None
                    if kind == "unknown"
                    else (not value if isinstance(value, bool) else "__other__")
                )
            )
            for event in test_events:
                if k in event["payload"]:
                    event["payload"][k] = facts[k]
        if kind == "non_applicable" and not record["eligibility_predicate"]:
            facts["university_id"] = (
                "leti" if facts["university_id"] == "sutd" else "sutd"
            )
        if kind == "unknown" and not record["eligibility_predicate"]:
            facts["age_band"] = "unknown"
        result = build_roadmap(
            "validation",
            facts,
            test_events,
            [record],
            date.fromisoformat(max(now, record["effective_from"])),
        )
        samples.append(
            {
                "case": kind,
                "result": result["decisions"],
                "tasks_count": len(result["tasks"]),
            }
        )
    return samples


def draft_body(draft, tenant, version):
    data = draft.model_dump(mode="json")
    data.update(
        version=version,
        university_id=tenant,
        layer="university",
        owner_id=tenant,
        mode="custom",
        status="draft",
        norm_confidence="U" if draft.source_type == "demo_model" else "C",
        eligibility_confidence="P",
        formula_confidence="P",
        legal_applicability_verified=False,
        source_snapshot=[
            {
                "id": draft.rule_id,
                "source_type": draft.source_type,
                "official_url": draft.source_url,
                "title": draft.source_title,
                "authority": tenant,
                "checked_at": str(draft.checked_at),
                "confidence": "U" if draft.source_type == "demo_model" else "C",
                "notes": draft.evidence_note,
                "section_label": draft.source_section,
                "purpose_i18n": draft.source_purpose_i18n,
                "navigation_verified": draft.source_navigation_verified,
            }
        ],
    )
    return data


def preview_publication(db, body):
    affected = []
    for user in db.execute("SELECT id,profile FROM users"):
        profile = json.loads(user["profile"])
        if (
            profile.get("university_id") != body["university_id"]
            or not profile["consent"]
        ):
            continue
        _, changes = plan_diff(db, user["id"], snapshot(db, user["id"], body))
        if changes:
            affected.append({"user_id": user["id"], "changes": changes})
    token = hashlib.sha256(
        dumps({"rule": body, "affected": affected}).encode()
    ).hexdigest()
    return {
        "affected_count": len(affected),
        "affected": affected,
        "preview_token": token,
    }

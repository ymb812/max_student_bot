"""Pure deterministic roadmap calculation: no network, database or LLM calls."""

from copy import deepcopy
from datetime import date, timedelta
from app.catalog import i18n
from app.timeutil import moscow_today


def reduce_events(profile, events):
    facts = deepcopy(profile)
    facts["_entry_episode"] = "initial-entry"
    facts["_residence_episode"] = (
        "initial-entry" if profile.get("entry_at") else "initial-residence"
    )
    facts["_visa_cycle"] = profile.get("visa_expiry") or "unknown"
    facts["_registration_cycle"] = profile.get("registration_expiry") or "unknown"
    facts["_medical_cycle"] = profile.get("last_medical_completed_at") or "unknown"
    facts["_medical_cycles"] = {
        facts["_medical_cycle"]: profile.get("last_medical_completed_at")
    }
    facts["_medical_reported"] = False
    facts["_residence_anchor"] = profile.get("entry_at")
    facts["_review_event"] = None
    facts["_episodes"] = {"initial-entry", "initial-residence", "lifetime"}
    facts["_registration_confirmed"] = False
    active = [e for e in events if not e.get("retracted_at")]
    replaced = {e.get("supersedes_event_id") for e in active}
    for event in sorted(
        (e for e in active if e["id"] not in replaced),
        key=lambda e: (e["occurred_at"], e["recorded_at"], e["id"]),
    ):
        typ, payload, eid = event["type"], event["payload"], event["id"]
        facts["_episodes"].add(eid)
        if typ in ("entry_recorded", "reentry_recorded"):
            entry_facts = payload.copy()
            # The first onboarding entry can record an unknown purpose. A later
            # clarification of that initial fact must not be hidden by it.
            # A new re-entry is a new episode, so its unknown purpose still wins.
            if (
                typ == "entry_recorded"
                and entry_facts.get("entry_purpose") == "unknown"
                and profile.get("entry_purpose") not in (None, "unknown")
            ):
                entry_facts.pop("entry_purpose")
            facts.update(entry_facts)
            facts["entry_at"] = event["occurred_at"]
            facts["arrival_at"] = payload.get("arrival_at")
            facts["_entry_episode"] = facts["_residence_episode"] = eid
            facts["_residence_anchor"] = event["occurred_at"]
            facts["_registration_confirmed"] = False
            facts["registration_expiry"] = None
            facts["_registration_cycle"] = "unknown"
        elif typ == "address_changed":
            facts["residence_type"] = payload["residence_type"]
            facts["_residence_episode"] = eid
            facts["_residence_anchor"] = event["occurred_at"]
            facts["_registration_confirmed"] = False
            facts["registration_expiry"] = None
            facts["_registration_cycle"] = "unknown"
        elif typ == "visa_issued":
            facts["visa_expiry"] = payload["visa_expiry"]
            facts["visa_regime"] = "visa"
            facts["_visa_cycle"] = eid
        elif typ == "registration_confirmed":
            facts["residence_type"] = payload["residence_type"]
            facts["registration_expiry"] = payload["registration_expiry"]
            if payload.get("stay_expiry"):
                facts["stay_expiry"] = payload["stay_expiry"]
            facts["_registration_cycle"] = eid
            facts["_registration_confirmed"] = True
        elif typ == "medical_completed":
            facts["last_medical_completed_at"] = event["occurred_at"]
            facts["_medical_cycle"] = eid
            facts["_medical_cycles"][eid] = event["occurred_at"]
            facts["_medical_reported"] = True
        elif typ == "fingerprinting_completed":
            facts["fingerprinting_completed"] = True
        elif typ in (
            "hotel_stay_started",
            "hotel_stay_ended",
            "passport_replaced",
            "status_changed",
            "enrolment_changed",
        ):
            facts["_review_event"] = eid
            facts["_registration_confirmed"] = False
            if typ == "status_changed":
                facts["migration_basis"] = payload["status"]
            if typ == "enrolment_changed":
                facts["study_status"] = payload["status"]
    return facts


def support_status(f):
    if (
        f.get("age_band") == "minor"
        or f.get("campus_id") != "main"
        or f.get("migration_basis") not in ("study", "unknown")
        or f.get("study_status") not in ("active", "unknown")
    ):
        return "needs_review", ["support_envelope"]
    missing = [
        k
        for k in ("age_band", "migration_basis", "study_status")
        if f.get(k) in (None, "unknown")
    ]
    return ("conditional", missing) if missing else ("actionable", [])


def legal_status(f, biometric=False):
    status, missing = support_status(f)
    if status == "needs_review":
        return status, missing
    missing += [
        k
        for k in ("citizenship", "entry_purpose", "stay_over_90_days")
        if f.get(k) in (None, "unknown", "")
    ]
    if biometric and f.get("fingerprinting_completed") is None:
        missing.append("fingerprinting_completed")
    if missing:
        return "conditional", sorted(set(missing))
    return "needs_review", ["country_exemptions_and_legal_applicability"]


def temporal(spec, facts, rule, allow, now):
    value = deepcopy(spec)
    value.update(
        timezone="Europe/Moscow",
        computed_at=None,
        rule_version=rule["version"],
        source_url=rule["source_snapshot"][0]["official_url"],
        checked_at=rule["source_snapshot"][0]["checked_at"],
        formula_or_literal=f"{spec['anchor_field']} {spec.get('offset')} {spec['unit']}",
    )
    anchor = facts.get(spec["anchor_field"])
    # No synthetic working-day calendar or university schedule is used.
    if (
        allow
        and spec["kind"] != "legal_deadline"
        and spec["unit"] == "calendar"
        and anchor
        and spec.get("offset") is not None
    ):
        value["computed_at"] = (
            date.fromisoformat(str(anchor)[:10]) + timedelta(days=spec["offset"])
        ).isoformat()
    if allow and spec.get("absolute_date") and spec["kind"] != "legal_deadline":
        value["computed_at"] = spec["absolute_date"]
    return value


def build_roadmap(user_id, profile, events, rules, now=None):
    today = now or moscow_today()
    f = reduce_events(profile, events)
    tasks, decisions = [], []
    if not f.get("university_id") or not f.get("consent"):
        return {"tasks": [], "decisions": [], "facts": f}
    support, support_missing = support_status(f)
    seen = set()
    for rule in rules:
        if (
            rule.get("university_id") != f["university_id"]
            or rule.get("effective_from", "0001-01-01") > today.isoformat()
        ):
            continue
        family = rule["family"]
        status, missing = support, support_missing[:]
        episode, cycle = "lifetime", "once"
        specs = deepcopy(rule["deadline_specs"])
        applies = True
        task_facts = deepcopy(f)
        if rule.get("mode") == "custom":
            for k, expected in rule["eligibility_predicate"].items():
                if f.get(k) in (None, "unknown", ""):
                    status, missing = "conditional", missing + [k]
                elif f[k] != expected:
                    applies = False
            replaced = {
                e.get("supersedes_event_id")
                for e in events
                if not e.get("retracted_at")
            }
            triggers = [
                e
                for e in events
                if e["type"] in rule["trigger_types"]
                and not e.get("retracted_at")
                and e["id"] not in replaced
            ]
            if rule["trigger_types"]:
                if not triggers:
                    applies = False
                else:
                    trigger = max(
                        triggers,
                        key=lambda e: (e["occurred_at"], e["recorded_at"], e["id"]),
                    )
                    episode = trigger["id"]
                    task_facts["occurred_at"] = trigger["occurred_at"]
            anchors = {s["anchor_field"] for s in specs}
            if "visa_expiry" in anchors:
                cycle = f["_visa_cycle"]
            elif anchors & {"registration_expiry", "stay_expiry"}:
                cycle = f["_registration_cycle"]
            elif anchors & {"entry_at", "arrival_at"}:
                episode = f["_entry_episode"]
            for spec in specs:
                if not spec.get("absolute_date") and not task_facts.get(
                    spec["anchor_field"]
                ):
                    if status != "needs_review":
                        status = "conditional"
                    missing.append(spec["anchor_field"])
        elif family == "M01":
            applies = not f.get("entry_at")
            episode = "pre-entry"
            if f.get("visa_regime") == "unknown":
                status, missing = "conditional", missing + ["visa_regime"]
            if f.get("visa_regime") == "visa_free":
                specs = []
                if f.get("study_form") == "unknown":
                    status, missing = "conditional", missing + ["study_form"]
        elif family in ("M02", "M03"):
            applies = bool(f.get("entry_at"))
            episode = (
                f["_entry_episode"] if family == "M02" else f["_residence_episode"]
            )
            if family == "M03" and episode != f["_entry_episode"]:
                task_facts["entry_at"] = f["_residence_anchor"]
                if f["university_id"] == "leti":
                    specs = []
                else:
                    specs[0]["literal"] = i18n(
                        "В течение 2 дней после указанного изменения; единицу времени уточнить",
                        "Within 2 days of the reported change; confirm the time unit",
                    )
            if f.get("entry_purpose") != "study":
                status = (
                    "conditional"
                    if f.get("entry_purpose") == "unknown"
                    else "needs_review"
                )
                missing.append("entry_purpose")
        elif family == "M04":
            applies = bool(f.get("entry_at"))
            episode = f["_residence_episode"]
            task_facts["occurred_at"] = f["_residence_anchor"]
            if f.get("residence_type") == "unknown":
                status, missing = "conditional", missing + ["residence_type"]
            elif f.get("residence_type") == "other":
                status, missing = (
                    "needs_review",
                    missing + ["host_and_registration_effect"],
                )
            if f["_review_event"]:
                status = "requires_recheck"
        elif family in ("M05", "M06", "M10"):
            applies = bool(f.get("entry_at"))
            if (
                f.get("stay_over_90_days") is False
                and support == "actionable"
                and f.get("entry_purpose") == "study"
            ):
                applies = False
            status, missing = legal_status(f, family == "M06")
            if family == "M05":
                episode = f["_entry_episode"]
                applies &= not bool(f.get("last_medical_completed_at"))
            elif family == "M10":
                applies &= bool(f.get("last_medical_completed_at"))
                cycle = f["_medical_cycle"]
            elif f.get("fingerprinting_completed"):
                status, missing = "actionable", []
        elif family == "M07":
            applies = f.get("visa_regime") != "visa_free"
            cycle = f["_visa_cycle"]
            if not f.get("visa_expiry") or f.get("visa_regime") == "unknown":
                status, missing = (
                    "conditional",
                    missing
                    + ["visa_expiry" if not f.get("visa_expiry") else "visa_regime"],
                )
        elif family == "M08":
            applies = bool(f.get("entry_at"))
            cycle = f["_registration_cycle"]
            episode = f["_residence_episode"]
            if not f.get("registration_expiry"):
                status, missing = "conditional", missing + ["registration_expiry"]
            elif f["university_id"] == "sutd" and f.get("residence_type") != "dorm":
                specs = [s for s in specs if s["kind"] == "document_expiry"]
            if f.get("stay_expiry"):
                specs.append(
                    {
                        "kind": "document_expiry",
                        "owner": "user",
                        "required_or_recommended": "document_fact",
                        "anchor_field": "stay_expiry",
                        "offset": 0,
                        "unit": "calendar",
                        "literal": i18n(
                            "Окончание пребывания — отдельный факт; порядок продления уточнить",
                            "Stay expiry is a separate document fact; confirm the extension procedure",
                        ),
                        "uncertainty": "stay_extension_applicability_unverified",
                    }
                )
        elif family == "M09":
            applies = bool(f["_review_event"])
            episode = f["_review_event"] or "none"
            status, missing = "needs_review", ["event_legal_effect"]
        if support == "needs_review":
            status, missing = support, support_missing
        decisions.append(
            {
                "rule_id": rule["rule_id"],
                "version": rule["version"],
                "eligibility": False
                if not applies
                else (
                    True if status in ("actionable", "requires_recheck") else "unknown"
                ),
                "engine_status": status,
                "missing_fields": missing,
            }
        )
        if not applies:
            continue
        semantic = f"{rule['semantic_action_key']}:{episode}:{cycle}"
        if semantic in seen:
            continue
        seen.add(semantic)
        values = [
            temporal(
                s,
                task_facts,
                rule,
                status == "actionable" or s["kind"] == "document_expiry",
                today,
            )
            for s in specs
        ]
        dates = [
            v["computed_at"]
            for v in values
            if v["computed_at"] and v["kind"] != "document_expiry"
        ]
        nearest = min(dates) if dates else None
        bucket = (
            "now"
            if not nearest or nearest <= today.isoformat()
            else (
                "soon"
                if nearest <= (today + timedelta(days=30)).isoformat()
                else "later"
            )
        )
        task = {
            "task_key": f"{user_id}:{rule['rule_id']}:{episode}:{cycle}",
            "rule_id": rule["rule_id"],
            "rule_version": rule["version"],
            "family": family,
            "episode_id": episode,
            "cycle_id": cycle,
            "semantic_action_key": semantic,
            "title_i18n": rule["title_i18n"],
            "action_i18n": rule["action_i18n"],
            "documents_i18n": rule["documents_i18n"],
            "contact": rule["contact"],
            "dates": values,
            "source_snapshot": rule["source_snapshot"],
            "engine_status": status,
            "priority_bucket": bucket,
            "eligibility_decision": True
            if status in ("actionable", "requires_recheck")
            else "unknown",
            "eligibility_reason": i18n(
                "Локальная инструкция по выбранному вузу и обстоятельствам."
                if status == "actionable"
                else "Для автоматического вывода требуется уточнение данных или проверка в офисе.",
                "Local instruction for your university and circumstances."
                if status == "actionable"
                else "More information or an office review is required for an automatic decision.",
            ),
            "missing_fields": sorted(set(missing)),
            "verification": "user_attested",
            "norm_confidence": rule["norm_confidence"],
            "eligibility_confidence": rule["eligibility_confidence"],
            "formula_confidence": "P" if dates else "U",
            "demo_model": rule.get("source_type") == "demo_model",
            "auto_completed": (
                family == "M06" and bool(f.get("fingerprinting_completed"))
            )
            or (family == "M04" and f["_registration_confirmed"]),
        }
        tasks.append(task)
        if family == "M04" and rule.get("residence_actions_i18n"):
            task["action_i18n"] = rule["residence_actions_i18n"].get(
                f.get("residence_type"), rule["action_i18n"]
            )
    return {"tasks": tasks, "decisions": decisions, "facts": f}

"""Pure projection of attested process results; no persistence or inferred legal facts."""
from copy import deepcopy


def bi(ru, en):
    return {"ru": ru, "en": en}


OUTCOMES = {
    "requested": bi("Запрос отправлен", "Request sent"),
    "submitted": bi("Документы поданы", "Documents submitted"),
    "received": bi("Результат получен", "Result received"),
    "completed": bi("Выполнено по вашему сообщению", "Completed as reported by you"),
    "partial": bi("Передана часть комплекта", "Part of the package submitted"),
    "question": bi("Есть ошибка или вопрос", "There is an error or question"),
    "question_sent": bi("Вопрос отправлен, ожидается ответ", "Question sent, awaiting an answer"),
    "clarified": bi("Ответ получен; применимость требует проверки", "Answer received; applicability needs review"),
}


def project_reports(facts, reports):
    f = facts
    active = [r for r in reports if not r.get("retracted_at")]
    replaced = {r.get("supersedes_report_id") for r in active}
    active = [r for r in active if r["id"] not in replaced]
    by_id = {r["id"]: r for r in active}
    all_ids = {r["id"] for r in reports}

    def valid(report, visited=None):
        visited = (visited or set()) | {report["id"]}
        dependencies = list(report.get("dependencies", []))
        basis = report["body"].get("basis_cycle")
        if report["process"] in ("visa_renewal", "registration_renewal") and basis in all_ids:
            dependencies.append(basis)
        return all(d in by_id and d not in visited and valid(by_id[d], visited) for d in dependencies)

    baseline_visa, baseline_registration = f["_visa_cycle"], f["_registration_cycle"]
    f["_workflow"] = {}
    f["_report_receipts"] = []
    for report in sorted(active, key=lambda r: (r["recorded_at"], r["id"])):
        report = {**report, "dependencies_valid": valid(report)}
        f["_workflow"][report["task_key"]] = report
        if report["outcome"] != "received" or not report["dependencies_valid"]:
            continue
        process = report["process"]
        body = report["body"]
        if process in ("initial_visa", "visa_renewal") and (body.get("basis_cycle", report["cycle_id"]) == f["_visa_cycle"] or (process == "initial_visa" and not f.get("_visa_issued_event") and f["_visa_cycle"] == baseline_visa)):
            f["_visa_cycle"] = report["id"]
            f["visa_expiry"] = body.get("document_expiry")
            f["_visa_received"] = True
            f["visa_result_id"] = report["id"]
            f["_report_receipts"].append(report)
        if process in ("registration", "registration_renewal") and report["episode_id"] == f["_residence_episode"] and (body.get("basis_cycle", report["cycle_id"]) == f["_registration_cycle"] or (process == "registration" and not f.get("_registration_issued_event") and f["_registration_cycle"] == baseline_registration)):
            f["_registration_cycle"] = report["id"]
            f["registration_expiry"] = body.get("document_expiry")
            f["_registration_confirmed"] = True
            f["registration_result_id"] = report["id"]
            f["_report_receipts"].append(report)
    return f


def report_for(f, process, episode=None):
    matches = [r for r in f.get("_workflow", {}).values() if r["process"] == process and (episode is None or r["episode_id"] == episode)]
    return max(matches, key=lambda r: (r["recorded_at"], r["id"]), default=None)


def shape_task(task, rule, f):
    process = rule.get("process")
    if not process:
        return task
    arrived = bool(f.get("entry_at")) or f.get("arrival_status") == "arrived"
    task.update(process=process, presentation_stage=rule["presentation_stage"], availability="available",
                workflow_status="not_started", result_actions=[], dependency_report_ids=[])
    task["valid_result_outcomes"] = {
        "invitation": ["requested", "received"], "initial_visa": ["submitted", "received"],
        "trip": ["completed"], "documents": ["completed", "question"], "office": ["partial", "completed"],
        "registration": ["submitted", "received"], "visa_renewal": ["submitted", "received"],
        "registration_renewal": ["submitted", "received"], "consultation": [], "entry_context": [],
    }[process] + ["question_sent", "clarified"]
    for key in ("performer_i18n", "expected_result_i18n", "help_i18n", "contact_i18n"):
        task[key] = rule.get(key, {})
    task["document_instruction_indices"] = rule.get("document_instruction_indices", [])
    task["document_note_i18n"] = rule.get("document_note_i18n", {})
    task["contact_note_i18n"] = rule.get("contact_note_i18n", {})
    if rule.get("renewal_note_i18n"):
        task["document_guidance_i18n"] = rule["renewal_note_i18n"]
        if process == "registration_renewal" and f.get("residence_type") == "private":
            task["document_guidance_i18n"] = rule["private_registration_note_i18n"]
        elif f.get("visa_regime") == "visa":
            task["documents_i18n"] = rule["renewal_visa_documents_i18n"]
            task["document_instruction_indices"] = []
            task["document_guidance_i18n"] = bi("Список из инструкции ЛЭТИ для визового въезда. Уточните применимость и актуальные требования перед подачей.", "This is LETI’s checklist for visa entry. Confirm applicability and current requirements before submitting.")
    report = f.get("_workflow", {}).get(task["task_key"])
    # M04 is scoped to a residence, its receipt starts a *renewal* cycle.
    if process == "registration":
        report = report_for(f, process, task["episode_id"])
    if report:
        task.update(result_report_id=report["id"], reported_outcome=report["outcome"], result_occurred_at=report["occurred_at"], result_recorded_at=report["recorded_at"], missing_documents=report["body"].get("missing_documents", []))
        if not report["dependencies_valid"]:
            task.update(engine_status="requires_recheck", auto_completed=False,
                        availability_reason_i18n=bi("Основание предыдущего результата отменено или исправлено. Подтвердите актуальное состояние.", "The basis of this result was retracted or corrected. Confirm the current state."))
        else:
            outcome = report["outcome"]
            task["workflow_status"] = "waiting" if outcome in ("requested", "submitted", "question_sent") else "partial" if outcome == "partial" else "needs_help" if outcome in ("question", "clarified") else "completed"
            if outcome in ("received", "completed"):
                task["auto_completed"] = True
            if outcome in ("question", "question_sent", "clarified") and process == "documents":
                task["engine_status"] = "needs_review"
    if task.get("auto_completed"):
        task["workflow_status"] = "completed"
    if process == "entry_context":
        if f.get("entry_at") and f.get("entry_purpose") == "study":
            task.update(auto_completed=True, workflow_status="completed")
        elif not arrived:
            task.update(availability="future", availability_reason_i18n=bi("После фактического въезда. Подготовительные отметки не обязательны для сообщения о въезде.", "After actual entry. You can report entry even without completing preparation checks."))
            trip = report_for(f, "trip")
            if trip and trip["outcome"] == "completed" and trip["dependencies_valid"]:
                task["availability"] = "available"
        elif not f.get("entry_at"):
            task.update(engine_status="conditional", missing_fields=["entry_at"], title_i18n=bi("Укажите дату последнего въезда", "Add your last entry date"))
    elif process in ("invitation", "initial_visa", "trip"):
        invitation = report_for(f, "invitation")
        visa = report_for(f, "initial_visa")
        visa_ready = bool(f.get("visa_expiry") or f.get("_visa_received") or (visa and visa["outcome"] == "received" and visa["dependencies_valid"]))
        if arrived and not task.get("auto_completed"):
            task.update(availability="past", availability_reason_i18n=bi("Вы уже в России. Выполнение этой подготовки не сообщалось; возвращаться к первому приезду не нужно.", "You are already in Russia. Completion was not reported; you do not need to repeat first-arrival preparation."))
        elif process == "invitation" and visa_ready and not task.get("auto_completed"):
            task.update(availability="past", availability_reason_i18n=bi("Виза уже получена. Получение приглашения отдельно не подтверждалось.", "Your visa is already received. Invitation receipt was not separately reported."))
        elif process == "initial_visa" and not visa_ready and not (invitation and invitation["outcome"] == "received" and invitation["dependencies_valid"]):
            if not report:
                task.update(availability="future", availability_reason_i18n=bi("После получения приглашения. Если уже подали документы или получили визу вне сервиса, сообщите именно этот факт.", "After invitation receipt. If you already submitted documents or received a visa outside the service, report that fact."))
        elif process == "trip" and f.get("visa_regime") == "visa" and not visa_ready:
            task.update(availability="future", availability_reason_i18n=bi("После получения учебной визы. Сам факт въезда можно сообщить отдельно в любой момент.", "After receiving your study visa. Actual entry can be reported separately at any time."))
        if process == "invitation" and not arrived and not visa_ready and f.get("preparation_state") in (None, "unknown") and (not report or report["outcome"] not in ("requested", "received")) and task["engine_status"] == "actionable":
            task.update(engine_status="conditional", missing_fields=["preparation_state"],
                        title_i18n=bi("Уточните готовность приглашения", "Check your invitation status"),
                        action_i18n=bi("Проверьте, отправляли ли вы запрос и получено ли приглашение. Если ещё не начинали — уточните этот ответ. Если запрос отправлен или документ получен, сообщите результат; повторять подачу не нужно.", "Check whether you requested or received an invitation. If you have not started, clarify that answer. If you already sent the request or received the document, report the result; do not apply again."))
        if process == "initial_visa" and invitation and invitation["outcome"] == "received":
            task["dependency_report_ids"] = [invitation["id"]]
        if process == "trip" and visa and visa["outcome"] == "received":
            task["dependency_report_ids"] = [visa["id"]]
    elif not arrived:
        task.update(availability="future", availability_reason_i18n=bi("После фактического въезда; пока можно ознакомиться с инструкцией.", "After actual entry; you can read the instructions now."))
    elif not f.get("entry_at") and process not in ("visa_renewal",):
        # Completed external facts are retained even while entry date is unknown.
        if not task.get("auto_completed"):
            task.update(availability="future", availability_reason_i18n=bi("Сначала уточните дату последнего въезда.", "First clarify the date of your last entry."))
    if process == "visa_renewal" and not f.get("visa_expiry") and not arrived:
        task["availability"] = "future"
    if process == "registration_renewal" and not f.get("registration_expiry") and not f.get("_registration_confirmed"):
        task.update(availability="future", availability_reason_i18n=bi("После получения регистрации и её срока окончания.", "After receiving registration and its expiry date."))
    if process == "office" and f["university_id"] == "leti" and f.get("entry_at") and not f.get("arrival_at") and not task.get("auto_completed") and task["engine_status"] == "actionable":
        task.update(engine_status="conditional", missing_fields=["arrival_at"])
    if f.get("entry_purpose") == "other" and arrived:
        task.update(engine_status="needs_review", missing_fields=["entry_purpose"])
    if task["availability"] == "available" and not task.get("auto_completed"):
        waiting = task["workflow_status"] == "waiting"
        actions = {
            "invitation": ["received"] if waiting else ["requested", "received"],
            "initial_visa": ["received"] if waiting else ["submitted", "received"],
            "trip": ["completed"], "documents": ["completed", "question"],
            "office": ["partial", "completed"],
            "registration": ["received"] if waiting else ["submitted", "received"],
            "visa_renewal": ["received"] if waiting else ["submitted", "received"],
            "registration_renewal": ["received"] if waiting else ["submitted", "received"],
            "consultation": ["clarified"] if waiting else ["question_sent"],
        }.get(process, [])
        if task["engine_status"] in ("conditional", "needs_review"):
            actions = ["clarified"] if waiting else ["question_sent"]
        if process == "documents" and task.get("reported_outcome") in ("question", "question_sent", "clarified"):
            actions = ["completed", "question_sent"]
        if task.get("reported_outcome") == "question_sent":
            actions = ["clarified"] + [a for a in actions if a not in ("clarified", "question_sent")]
        task["result_actions"] = actions
    if task["workflow_status"] == "waiting":
        task["waiting_i18n"] = waiting_copy(process, task.get("reported_outcome"), f)
    return task


def waiting_copy(process, outcome, facts):
    if outcome == "question_sent":
        return bi("Ответ можно отметить в этой задаче.", "You can record the answer in this task.")
    if process == "invitation":
        return bi("Приглашение придёт на e-mail из анкеты. По вопросам готовности обратитесь в отдел регистраций и виз.", "Your invitation will be sent to the email in your application. Contact the registration and visa office to check its status.") if facts["university_id"] == "sutd" else bi("Способ и срок получения уточните в отделе по работе с иностранными учащимися ЛЭТИ.", "Ask LETI’s international student office when and how you will receive your invitation.")
    if process == "initial_visa":
        return bi("Проверяйте готовность способом, который вам сообщили при подаче заявления.", "Use the status-check method you were given when you applied.")
    if process == "visa_renewal":
        return bi("Уточните готовность визы в отделе, куда передали документы.", "Ask the office that received your documents about the visa.")
    if "registration" in process:
        return bi("Уточните готовность и способ получения у того, кому передали документы для регистрации.", "Ask whoever received your registration documents when and how to collect the result.")
    return bi("Ответ можно отметить в этой задаче.", "You can record the answer in this task.")


def rank_tasks(tasks, today):
    """One server ordering shared by the Hero and lists; expiry is never submission."""
    from datetime import date, timedelta
    attention_until = (date.fromisoformat(today) + timedelta(days=30)).isoformat()
    def key(t):
        dates = [d["computed_at"] for d in t.get("dates", []) if d.get("computed_at") and d["kind"] != "document_expiry"]
        nearest = min(dates, default="9999-12-31")
        available = t.get("availability", "available") == "available"
        eligible = t["engine_status"] in ("actionable", "requires_recheck")
        waiting = t.get("workflow_status") == "waiting"
        urgent = available and eligible and not waiting and nearest <= today
        # A known expiring document attracts attention without inventing a
        # submission deadline or a countdown. Keep this separate from dates above.
        expiry_attention = available and eligible and not waiting and any(
            d.get("computed_at") and d["kind"] == "document_expiry" and d["computed_at"] <= attention_until
            for d in t.get("dates", []))
        clarification = t.get("process") == "entry_context" and t["engine_status"] == "conditional"
        return (0 if urgent else 1 if expiry_attention else 2 if clarification and available else 3 if eligible and available and not waiting else 4 if eligible and available else 5,
                {"now": 0, "soon": 1, "later": 2}.get(t["priority_bucket"], 2), nearest,
                waiting, t.get("route_order", 99), t["task_key"])
    ordered = sorted(tasks, key=key)
    hero = None
    for rank, task in enumerate(ordered):
        task["priority_rank"] = rank
        if hero is None and task["engine_status"] != "superseded" and task.get("availability", "available") == "available" and (task["user_status"] != "completed" or task["engine_status"] == "requires_recheck"):
            hero = task["task_key"]
    return hero

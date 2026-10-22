"""Explain existing engine decisions using recorded facts; never decide eligibility."""


def bi(ru, en):
    return {"ru": ru, "en": en}


def explain_task(task, facts):
    process = task.get("process")
    base = {
        "invitation": ("Для подготовки визового въезда нужно выяснить состояние приглашения.", "Preparing for visa entry requires knowing your invitation status."),
        "initial_visa": ("Это оформление первичной учебной визы; получение приглашения и визы отмечаются отдельно.", "This is the initial study visa application; invitation and visa receipt are recorded separately."),
        "trip": ("Это подготовка документов, первого обращения и заселения перед поездкой.", "This step covers travel documents, your first university contact and check-in arrangements."),
        "entry_context": ("Дата и цель фактического въезда нужны для действий после приезда.", "The actual entry date and purpose are needed for post-arrival steps."),
        "documents": ("После въезда нужно сверить сведения во въездных документах.", "After entry, the details in your entry documents need checking."),
        "office": ("Это передача комплекта по инструкции выбранного вуза после въезда или переезда.", "This is document submission under your university’s instructions after entry or a move."),
        "registration": ("Эта задача относится к регистрации по месту вашего проживания; она отделена от передачи комплекта в вуз.", "This task concerns registration at your residence, separately from submitting documents to the university."),
        "visa_renewal": ("Это подготовка продления текущей визы по её дате окончания.", "This is preparation to renew your current visa, based on its expiry date."),
        "registration_renewal": ("Это подготовка продления текущей регистрации по её дате окончания.", "This is preparation to renew your current registration, based on its expiry date."),
    }.get(process, ("Для этой процедуры нужно проверить применимость и порядок действий в вашей ситуации.", "This procedure requires checking applicability and the steps for your situation."))
    reason = bi(*base)
    missing = task.get("missing_fields", [])
    if "support_envelope" in missing:
        causes = []
        if facts.get("age_band") == "minor":
            causes.append(bi("возраст до 18 лет", "age under 18"))
        if facts.get("campus_id") != "main":
            causes.append(bi("другая площадка обучения", "a different campus"))
        if facts.get("migration_basis") not in ("study", "unknown"):
            causes.append(bi("особое основание пребывания", "a different basis for stay"))
        if facts.get("study_status") not in ("active", "admitted", "unknown"):
            causes.append(bi("изменённый учебный статус", "a changed study status"))
        reason = bi("Нужна индивидуальная проверка: "+", ".join(c["ru"] for c in causes)+". Обсудите порядок с отделом.", "An individual review is needed: "+", ".join(c["en"] for c in causes)+". Discuss the procedure with the office.")
    elif task.get("reported_outcome") in ("question", "question_sent", "clarified"):
        reason = bi("Вы отметили вопрос по этому действию. Отправка вопроса и получение ответа не подтверждают завершение самой процедуры.", "You reported a question about this task. Sending a question or receiving an answer does not confirm completion of the procedure itself.")
    elif task["engine_status"] in ("conditional", "needs_review", "requires_recheck"):
        suffix = bi(" Не хватает сведений или подтверждения применимости; нужные уточнения перечислены в карточке.", " Information or confirmation of applicability is missing; the task lists what needs checking.")
        if "country_exemptions_and_legal_applicability" in missing:
            suffix = bi(" Применимость с учётом гражданства и исключений не подтверждена. Заполнение профиля само по себе этого не подтверждает.", " Applicability, including citizenship-based exceptions, is unconfirmed. Completing your profile does not verify it.")
        reason = {lang: value + suffix[lang] for lang, value in reason.items()}
    task["eligibility_reason"] = reason
    if task["engine_status"] in ("conditional", "needs_review", "requires_recheck"):
        task["eligibility_confidence"] = "C"
    # Snapshots keep these facts even after a later entry/document changes the profile.
    context = {"entry_at": facts.get("entry_at")}
    if facts.get("_residence_episode") not in (facts.get("_entry_episode"), "initial-residence"):
        context["residence_event_at"] = facts.get("_residence_anchor")
    if process in ("initial_visa", "visa_renewal", "registration_renewal"):
        kind = "visa" if "visa" in process else "registration"
        context.update(document_kind=kind, document_expiry=facts.get(kind + "_expiry"))
    if task.get("family") == "M10":
        context["medical_completed_at"] = facts.get("last_medical_completed_at")
    task["context_dates"] = context

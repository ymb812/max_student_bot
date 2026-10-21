"""Versioned product copy layered on source records, never a legal rules engine."""
from copy import deepcopy


def bi(ru, en):
    return {"ru": ru, "en": en}


def adaptive_rules(rules):
    result = []
    for original in rules:
        rule = deepcopy(original)
        tenant, family = rule["university_id"], rule["family"]
        if family == "M01":
            for process, title, action, outcome in (
                ("invitation", bi("Получить приглашение", "Get your invitation"), bi(
                    "После подтверждения зачисления уточните у отдела регистраций и виз комплект и канал запроса. Отправьте запрос; готовое приглашение отдел направляет на указанный в анкете e-mail." if tenant == "sutd" else
                    "Обратитесь в отдел по работе с иностранными учащимися ЛЭТИ: уточните комплект, канал запроса приглашения и способ получения результата для вашей программы.",
                    "After admission, check the package and request channel with the registration and visa office. Submit the request; the office emails the invitation to the address in your application." if tenant == "sutd" else
                    "Ask LETI’s international student office about the invitation documents, request channel and delivery for your programme."), bi("Приглашение получено", "Invitation received")),
                ("initial_visa", bi("Получить учебную визу", "Get your study visa"), bi(
                    "С приглашением подготовьте документы по инструкции российского консульства или посольства, куда будете подавать заявление. Визу оформляет консульство; вуз помогает с приглашением. После подачи проверяйте результат способом, указанным при приёме документов.",
                    "With your invitation, prepare the documents required by the Russian consulate or embassy where you will apply. The consulate issues the visa; your university helps with the invitation. After submission, use the result channel given by the consulate."), bi("Учебная виза получена", "Study visa received")),
                ("trip", bi("Подготовить поездку", "Prepare your trip"), bi(
                    "Сверьте три пункта: документы для поездки по инструкции вуза, порядок первого обращения и заселение с принимающей стороной. Для безвизовых студентов СПбГУПТД очной и очно-заочной формы согласуйте дату прибытия с отделом регистраций и виз." if tenant == "sutd" else
                    "Сверьте документы для поездки с отделом ЛЭТИ. Уточните порядок первого обращения после прибытия в Петербург. Порядок заселения и документы уточните у общежития или владельца жилья; не переносите инструкции другого вуза.",
                    "Check travel documents with the university, your first visit and housing arrangements with your host. SUTD full-time and part-time visa-free students should agree their arrival date with the registration and visa office." if tenant == "sutd" else
                    "Check travel documents with LETI’s office and your first visit after arriving in St Petersburg. Ask your dormitory or landlord about check-in and documents; another university’s instructions do not apply."), bi("Документы, прибытие и заселение проверены", "Documents, arrival and housing checked")),
            ):
                child = deepcopy(rule)
                child.update(rule_id=f"{tenant}.M01.{process}", semantic_action_key=process,
                             process=process, title_i18n=title, action_i18n=action,
                             expected_result_i18n=outcome, presentation_stage="before")
                if process != "invitation":
                    child["deadline_specs"] = []
                if process == "initial_visa":
                    child["documents_i18n"] = bi(["Приглашение, если предусмотрено вашим порядком", "Комплект выбранного консульства — уточните в нём"], ["Invitation if required by your procedure", "Check the exact package with your consulate"])
                    child["performer_i18n"] = bi("Вы подаёте документы в выбранное консульство", "You apply at your chosen consulate")
                    child["contact"] = ("Консульство / Consulate: выберите учреждение по месту подачи; комплект и канал уточняются там. Помощь с приглашением / Invitation help: " + rule["contact"])
                elif process == "trip":
                    child["documents_i18n"] = bi(["Документы для поездки — инструкция вуза", "Порядок прибытия — международный отдел", "Порядок заселения — общежитие или собственник"], ["Travel documents — university instructions", "Arrival procedure — international office", "Check-in — dormitory or landlord"])
                enrich(child)
                result.append(child)
            entry = deepcopy(rule)
            entry.update(rule_id=f"{tenant}.M02.entry", family="M02", semantic_action_key="entry_context", process="entry_context", presentation_stage="arrival", deadline_specs=[],
                         title_i18n=bi("Укажите дату и цель въезда", "Add your entry date and purpose"),
                         action_i18n=bi("Найдите дату последнего въезда и цель в документах о въезде. Если дату установить не получается, обратитесь в международный отдел. Планируемая поездка не является фактическим въездом.", "Find the date of your last entry and the purpose in your entry documents. If you cannot establish the date, ask your international office. A planned trip is not an actual entry."),
                         expected_result_i18n=bi("Известны дата и цель фактического въезда", "Actual entry date and purpose are known"))
            enrich(entry)
            result.append(entry)
            continue
        rule["process"] = {"M02": "documents", "M03": "office", "M04": "registration", "M07": "visa_renewal", "M08": "registration_renewal"}.get(family, "consultation")
        rule["presentation_stage"] = "study" if family in ("M07", "M08", "M10") else "arrival"
        if family == "M02":
            rule["action_i18n"] = bi("Сначала самостоятельно сверьте имя, паспортные данные и даты в полученных документах: паспорт, виза при наличии, миграционная карта при применимости. Проверьте цель въезда там, где она указана. При расхождении подготовьте вопрос отделу; успешную проверку не отмечайте.", "First check your name, passport details and dates across the documents you received: passport, visa if applicable and migration card where required. Check the recorded entry purpose. If something differs, prepare a question for the office instead of reporting a successful check.")
            rule["documents_i18n"] = bi(["Паспорт", "Виза при наличии", "Миграционная карта при применимости"], ["Passport", "Visa if applicable", "Migration card where applicable"])
        if family == "M03":
            rule["title_i18n"] = bi("Передать весь комплект в отдел", "Submit the complete office package")
            rule["action_i18n"] = bi("Вы уже передали весь комплект после последнего приезда или изменения места проживания? Сверьте список ниже с отделом. Если передали часть — отметьте оставшиеся позиции. Звонок или письмо с вопросом не означает передачу комплекта.", "Have you submitted the full package after your latest arrival or residence change? Check the list below with the office. If you submitted part, select what remains. A call or a question does not count as document submission.")
            if tenant == "leti":
                rule["documents_i18n"] = bi(["Копия паспорта", "Копия миграционной карты", "Копия визы при наличии", "Копия направления/контракта/договора (кроме I курса)"], ["Passport copy", "Migration card copy", "Visa copy if applicable", "Referral/contract/agreement copy (except first-year students)"])
        if family == "M04":
            rule["title_i18n"] = bi("Получить регистрацию по месту проживания", "Receive your residence registration")
        if family in ("M07", "M08"):
            document = "визы" if family == "M07" else "регистрации"
            english = "visa" if family == "M07" else "registration"
            rule["action_i18n"] = bi(
                f"Сверьте дату окончания текущей {document} с документом. Уточните в указанном ниже отделе комплект и канал подачи для продления. Передайте документы и узнайте, как проверить готовность. Отметьте подачу, а получение нового документа подтвердите отдельно." + (" Для регистрации по частному адресу согласуйте действия с собственником и отделом." if family == "M08" else ""),
                f"Check your current {english} expiry against the document. Ask the office below for the renewal package and submission channel. Submit the documents and ask how to check readiness. Report submission first and receipt of the new document separately." + (" For registration at a private address, coordinate with the owner and office." if family == "M08" else ""))
        if family in ("M05", "M06", "M10"):
            rule["action_i18n"] = bi("Спросите международный отдел, применима ли эта процедура к вашему основанию, цели и длительности пребывания, гражданству и прежнему прохождению. Попросите актуальную инструкцию и способ проверки действительности прежних результатов. Отправка вопроса не подтверждает обязанность и не завершает процедуру.", "Ask the international office whether this procedure applies to your migration grounds, entry purpose, length of stay, citizenship and previous completion. Request current instructions and a way to check previous results. Sending a question does not establish applicability or complete the procedure.")
        enrich(rule)
        result.append(rule)
    return result


def enrich(rule):
    tenant, process = rule["university_id"], rule["process"]
    rule.setdefault("performer_i18n", bi("Вы; порядок уточняется у ответственного отдела или принимающей стороны", "You; confirm the procedure with the responsible office or host"))
    rule.setdefault("expected_result_i18n", {
        "documents": bi("Документы проверены без расхождений либо сформулирован вопрос", "Documents checked without discrepancies, or a question identified"),
        "office": bi("Весь комплект передан в отдел", "Full package submitted to the office"),
        "registration": bi("Документ регистрации получен; срок сохранён отдельно", "Registration received; expiry recorded separately"),
        "visa_renewal": bi("Новая виза получена — начинается следующий цикл", "New visa received — the next cycle starts"),
        "registration_renewal": bi("Новая регистрация получена — начинается следующий цикл", "New registration received — the next cycle starts"),
    }.get(process, bi("Получено индивидуальное разъяснение; применимость проверяется отдельно", "Individual guidance received; applicability is checked separately")))
    rule["help_i18n"] = bi("Если есть ошибка или вопрос, сообщите отделу вуз, этап, дату въезда (если известна), тип жилья и суть расхождения. Сканы и номера документов в этот сервис не передавайте.", "If something is wrong or unclear, tell the office your university, stage, known entry date, housing type and the discrepancy. Do not send scans or document numbers to this service.")
    for source in rule["source_snapshot"]:
        if source["id"] not in ("S1", "E1"):
            continue
        section = ("До въезда. Оформление приглашения" if process in ("invitation", "initial_visa") else "Порядок въезда в РФ" if process in ("documents", "entry_context", "trip", "office") else "Продление срока временного пребывания" if process.endswith("renewal") else "Миграционный учет") if tenant == "sutd" else "В течение первых суток со дня прибытия в Санкт-Петербург"
        source.update(section_label=section, navigation_verified=True, navigation_checked_at="2026-10-21",
                      purpose_i18n=bi("Найдите порядок первого обращения и контакт отдела; детали вашей процедуры уточните у него." if tenant == "leti" and process != "office" else "Сверьте порядок, комплект и ответственный отдел для этого действия.", "Find the first-visit procedure and office contact; ask the office about your specific procedure." if tenant == "leti" and process != "office" else "Check the procedure, document list and responsible office for this action."))
    # Only the three documented ambiguous seed intervals have a demo override.
    for spec in rule["deadline_specs"]:
        if spec["unit"] == "unspecified" and ((tenant == "sutd" and rule["family"] == "M03") or (tenant == "leti" and rule["family"] in ("M07", "M08"))):
            original = deepcopy(spec)
            n = abs(spec["offset"])
            spec.update(unit="working", unit_original="unspecified", unit_effective="working",
                        unit_basis="demo_assumption", original_spec=original, calendar_version=None,
                        counting_convention="exclude_anchor", uncertainty="verified_working_calendar_unavailable")
            spec["literal"] = bi(f"В течение {n} рабочих дней после въезда" if spec["offset"] > 0 else f"Передайте документы не позже чем за {n} рабочих дней до окончания документа", f"Within {n} working days after entry" if spec["offset"] > 0 else f"Submit documents no later than {n} working days before document expiry")

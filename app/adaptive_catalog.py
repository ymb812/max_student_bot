"""Versioned product copy layered on source records, never a legal rules engine."""
from copy import deepcopy
from app.content_evidence import apply_reviewed_content


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
                    "Сверьте документы для поездки с отделом ЛЭТИ. Уточните порядок первого обращения после прибытия в Петербург. Порядок заселения и документы уточните у общежития или владельца жилья.",
                    "Check travel documents with the university, your first visit and housing arrangements with your host. SUTD full-time and part-time visa-free students should agree their arrival date with the registration and visa office." if tenant == "sutd" else
                    "Check travel documents with LETI’s office and your first visit after arriving in St Petersburg. Ask your dormitory or landlord about check-in and documents."), bi("Документы, прибытие и заселение проверены", "Documents, arrival and housing checked")),
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
                         documents_i18n=bi(["Документ с отметкой о фактической дате въезда", "Миграционная карта с целью въезда, если предусмотрена"], ["Document recording your actual entry date", "Migration card with the entry purpose, where applicable"]),
                         action_i18n=bi("Найдите дату последнего въезда и цель в документах о въезде. Если дату установить не получается, обратитесь в международный отдел. После въезда укажите дату пересечения границы и цель из документов о въезде.", "Find the date of your last entry and the purpose in your entry documents. If you cannot establish the date, ask your international office. After entry, record the border-crossing date and the purpose from your entry documents."),
                         expected_result_i18n=bi("Известны дата и цель фактического въезда", "Actual entry date and purpose are known"))
            enrich(entry)
            result.append(entry)
            continue
        rule["process"] = {"M02": "documents", "M03": "office", "M04": "registration", "M07": "visa_renewal", "M08": "registration_renewal"}.get(family, "consultation")
        rule["presentation_stage"] = "study" if family in ("M07", "M08", "M10") else "arrival"
        if family == "M02":
            rule["action_i18n"] = bi("Сверьте имя, паспортные данные и даты в паспорте, визе — если она есть — и миграционной карте, если она предусмотрена для вашей ситуации. Проверьте цель въезда там, где она указана. Если всё совпадает, нажмите «Документы сверены, расхождений нет». Если нашли ошибку или не уверены, выберите «Есть ошибка или вопрос» и обратитесь в отдел.", "Check your name, passport details and dates in your passport, visa if you have one, and migration card where applicable. Check the entry purpose where it is recorded. If everything matches, select “Documents checked; no discrepancies found”. If there is an error or you are unsure, select “There is an error or question” and contact the office.")
            rule["documents_i18n"] = bi(["Паспорт", "Виза при наличии", "Миграционная карта при применимости"], ["Passport", "Visa if applicable", "Migration card where applicable"])
        if family == "M03":
            rule["title_i18n"] = bi("Передать документы в отдел вуза", "Submit documents to the university office")
            rule["action_i18n"] = bi("Сверьте список документов ниже с отделом и передайте комплект после последнего приезда или переезда. Если часть уже передана, отметьте, что осталось. Обращение с вопросом не считается передачей документов.", "Check the document list below with the office and submit the set after your latest arrival or move. If some documents are already submitted, record what remains. Asking a question does not count as submitting documents.")
            if tenant == "leti":
                rule["documents_i18n"] = bi(["Копия паспорта", "Копия миграционной карты", "Копия визы при наличии", "Копия направления/контракта/договора (кроме I курса)"], ["Passport copy", "Migration card copy", "Visa copy if applicable", "Referral/contract/agreement copy (except first-year students)"])
        if family == "M04":
            rule["title_i18n"] = bi("Получить регистрацию по месту проживания", "Receive your residence registration")
        if family in ("M07", "M08"):
            document = "визы" if family == "M07" else "регистрации"
            english = "visa" if family == "M07" else "registration"
            rule["title_i18n"] = bi("Продлить визу", "Renew your visa") if family == "M07" else bi("Продлить регистрацию", "Renew your registration")
            rule["action_i18n"] = bi(
                f"Сверьте дату окончания текущей {document} с документом. Уточните в указанном ниже отделе комплект и канал подачи для продления. Передайте документы и узнайте, как проверить готовность. Отметьте подачу, а получение нового документа подтвердите отдельно." + (" Для регистрации по частному адресу согласуйте действия с собственником и отделом." if family == "M08" else ""),
                f"Check your current {english} expiry against the document. Ask the office below for the renewal package and submission channel. Submit the documents and ask how to check readiness. Report submission first and receipt of the new document separately." + (" For registration at a private address, coordinate with the owner and office." if family == "M08" else ""))
        if family in ("M05", "M06", "M10"):
            rule["title_i18n"], rule["action_i18n"] = {
                "M05": (bi("Узнать, нужен ли вам медосмотр", "Check whether you need a medical examination"), bi("Уточните в отделе, нужно ли вам проходить медицинское освидетельствование, какие документы подготовить и где его пройти. Сообщите известные сведения о въезде и прежнем прохождении. Применимость к вашей ситуации пока не подтверждена.", "Ask the office whether you need a medical examination, which documents to prepare and where to go. Share the entry details and previous examination dates you know. Whether this applies to you is not yet confirmed.")),
                "M06": (bi("Узнать, нужны ли дактилоскопия и фотографирование", "Check whether you need fingerprinting and photography"), bi("Уточните в отделе, нужно ли вам сдавать отпечатки пальцев и проходить фотографирование. Если уже проходили, спросите, подходит ли прежнее подтверждение и как это проверить. Применимость к вашей ситуации пока не подтверждена.", "Ask the office whether you need fingerprinting and photography. If you have done this before, ask whether your previous confirmation is suitable and how to check it. Whether this applies to you is not yet confirmed.")),
                "M10": (bi("Узнать, нужен ли повторный медосмотр", "Check whether you need another medical examination"), bi("Сообщите отделу дату прежнего медосмотра, если она известна. Уточните, нужен ли новый осмотр и в какой срок. Прежний результат не проверяется приложением автоматически.", "Tell the office the date of your previous medical examination if known. Ask whether you need another examination and when. The app does not automatically verify your previous result.")),
            }[family]
        enrich(rule)
        result.append(rule)
    return result


def enrich(rule):
    tenant, process = rule["university_id"], rule["process"]
    rule.setdefault("performer_i18n", {})
    if process == "initial_visa":
        rule["performer_i18n"] = bi("Вы подаёте заявление; визу оформляет консульство", "You submit the application; the consulate issues the visa")
    instruction_items = {"Точный пакет уточните в офисе", "Комплект выбранного консульства — уточните в нём"}
    rule["document_instruction_indices"] = [i for i, item in enumerate(rule["documents_i18n"]["ru"]) if item in instruction_items]
    rule["document_note_i18n"] = bi("Для этой процедуры полный список документов пока не подтверждён. Уточните его в указанном отделе или учреждении.", "The full document list for this procedure has not been confirmed. Ask the office or institution listed here for the list.")
    rule.setdefault("expected_result_i18n", {
        "documents": bi("Документы проверены без расхождений либо сформулирован вопрос", "Documents checked without discrepancies, or a question identified"),
        "office": bi("Весь комплект передан в отдел", "Full package submitted to the office"),
        "registration": bi("Документ о регистрации получен. Дату окончания можно указать отдельно", "Registration document received. The expiry date can be added separately"),
        "visa_renewal": bi("Новая виза получена; её срок указан в плане, если известен", "New visa received; its expiry is added to your plan if known"),
        "registration_renewal": bi("Новая регистрация получена; её срок указан в плане, если известен", "New registration received; its expiry is added to your plan if known"),
    }.get(process, bi("Получено индивидуальное разъяснение; применимость проверяется отдельно", "Individual guidance received; applicability is checked separately")))
    rule["help_i18n"] = {
        "invitation": bi("Если в приглашении есть ошибка, сообщите об этом отделу, который его оформлял.", "If there is an error in your invitation, contact the office that issued it."),
        "initial_visa": bi("Вопросы о подаче и результате задайте выбранному консульству. С вопросами по приглашению обратитесь в отдел вуза.", "Ask your chosen consulate about the application and its result. Ask the university office about your invitation."),
        "documents": bi("Опишите отделу, в каком документе обнаружили расхождение и что нужно уточнить.", "Tell the office which document contains a discrepancy and what you need to clarify."),
        "office": bi("Уточните в отделе, каких документов не хватает и как их передать. Если остаток неизвестен, список можно оставить пустым.", "Ask the office which documents are missing and how to submit them. Leave the remaining-document list empty if you do not know."),
        "trip": bi("Вопросы по приезду задайте отделу вуза, по заселению — общежитию или собственнику жилья.", "Ask the university office about arrival and your dormitory or landlord about check-in."),
    }.get(process, bi("Свяжитесь с указанным отделом или тем, кому передали документы. Опишите вопрос и известные даты; здесь можно сохранить результат вашего обращения.", "Contact the office listed here or whoever received your documents. Describe the issue and dates you know; you can record the result of your enquiry here."))
    # Preserve published addresses and channels verbatim; translate only their role.
    contact = rule["contact"].split(" · ", 1)
    office = bi("Отдел регистраций и виз", "Registration and visa office") if tenant == "sutd" else bi("Международный студенческий офис", "International student office")
    rule["office_name_i18n"] = office
    address = contact[1] if len(contact) > 1 else rule["contact"]
    rule["contact_i18n"] = {lang: name + " · " + address for lang, name in office.items()}
    if process == "initial_visa":
        rule["contact_i18n"] = bi("Консульство: выберите учреждение по месту подачи; список документов и способ подачи уточните там. Помощь с приглашением: " + rule["contact_i18n"]["ru"], "Consulate: choose the office where you will apply; ask it about documents and how to submit them. Invitation help: " + rule["contact_i18n"]["en"])
    for source in rule["source_snapshot"]:
        if source["id"] not in ("S1", "E1"):
            continue
        section = ("До въезда. Оформление приглашения" if process in ("invitation", "initial_visa") else "Порядок въезда в РФ" if process in ("documents", "entry_context", "trip") else "Продление срока временного пребывания" if process.endswith("renewal") else "Миграционный учет") if tenant == "sutd" else "В течение первых суток со дня прибытия в Санкт-Петербург"
        source.update(section_label=section, navigation_verified=True, navigation_checked_at="2026-10-21",
                      purpose_i18n=bi("Найдите порядок первого обращения и контакт отдела; детали вашей процедуры уточните у него." if tenant == "leti" and process != "office" else "Сверьте порядок, комплект и ответственный отдел для этого действия.", "Find the first-visit procedure and office contact; ask the office about your specific procedure." if tenant == "leti" and process != "office" else "Check the procedure, document list and responsible office for this action."))
    apply_reviewed_content(rule)
    # Only the three documented ambiguous seed intervals have a demo override.
    for spec in rule["deadline_specs"]:
        if spec["unit"] == "unspecified" and ((tenant == "sutd" and rule["family"] == "M03") or (tenant == "leti" and rule["family"] in ("M07", "M08"))):
            original = deepcopy(spec)
            n = abs(spec["offset"])
            spec.update(unit="working", unit_original="unspecified", unit_effective="working",
                        unit_basis="demo_assumption", original_spec=original, calendar_version=None,
                        counting_convention="exclude_anchor", uncertainty="verified_working_calendar_unavailable")
            spec["literal"] = bi(f"В течение {n} рабочих дней после въезда" if spec["offset"] > 0 else f"Передайте документы не позже чем за {n} рабочих дней до окончания документа", f"Within {n} working days after entry" if spec["offset"] > 0 else f"Submit documents no later than {n} working days before document expiry")

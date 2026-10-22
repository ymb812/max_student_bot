"""Reviewed university copy, scoped sources and explicit gaps (22 October 2026).

No federal deadline, applicability predicate, or indexed office checklist is changed.
See docs/CONTENT_RESEARCH_2026_10_22.md for evidence and unresolved conflicts.
"""


def bi(ru, en):
    return {"ru": ru, "en": en}


def apply_reviewed_content(rule):
    tenant, process = rule["university_id"], rule["process"]
    for spec in rule["deadline_specs"]:
        # Existing source prose already explains an absent calculation in these rows.
        # Keep that prose and suppress a second generic explanation in the card.
        if "не рассчитана" in spec.get("literal", {}).get("ru", ""):
            spec["literal_explains_calculation"] = True
    if tenant == "sutd" and process == "invitation":
        rule["documents_i18n"] = bi(["Анкета для приглашения", "Копия паспортной страницы с личными данными; срок паспорта — не менее полутора лет от планируемого въезда"], ["Invitation application form", "Copy of the passport identity page; passport valid for at least 18 months from planned entry"])
        rule["action_i18n"] = bi(
            "После подтверждения зачисления передайте в отдел регистраций и виз анкету и копию страницы паспорта с личными данными — лично или по электронной почте. По инструкции вуза паспорт должен действовать ещё не менее полутора лет от планируемого въезда. Приглашение направят на e-mail из анкеты.",
            "After admission, submit the application form and a copy of your passport identity page to the registration and visa office, in person or by email. University instructions require at least 18 months of passport validity from planned entry. The invitation is emailed to your application address.")
    if tenant == "sutd":
        rule["contact_note_i18n"] = bi("Перед визитом уточните кабинет и часы приёма по inter@sutd.ru: сведения о кабинете в разделах сайта различаются.", "Confirm the room and reception hours via inter@sutd.ru before visiting: university pages list different room numbers.")
    if tenant == "leti":
        if process in ("invitation", "initial_visa"):
            rule["norm_confidence"] = "C"
        office = bi("Отдел по работе с иностранными учащимися", "International student office")
        if process in ("visa_renewal", "registration_renewal"):
            office = bi("Офис виз и регистраций", "Visa and registration office")
            # Only renewal checklists change: office partial-result indices stay intact.
            rule["renewal_visa_documents_i18n"] = bi(
                ["Заявление на продление", "Паспорт: оригинал и две копии значимых страниц", "Миграционная карта: оригинал и две копии", "Предыдущая регистрация (оригинал)", "Страховой документ", "Фотография 3 × 4", "Копия документа об обучении", "Подтверждения оплаты пошлин; реквизиты и суммы уточните перед оплатой"],
                ["Renewal application", "Passport: original and two copies of relevant pages", "Migration card: original and two copies", "Previous registration (original)", "Insurance document", "3 × 4 photo", "Copy of your study agreement or referral", "Fee receipts; confirm payment details and amounts before paying"])
            rule["renewal_note_i18n"] = bi("Для безвизового въезда состав и количество копий зависят от общежития. По частному адресу согласуйте оформление регистрации и передачу подтверждения вузу отдельно.", "For visa-free entry, documents and copy counts depend on the dormitory. For private housing, confirm registration arrangements and how to send proof to the university separately.")
            rule["private_registration_note_i18n"] = bi("Регистрацию по частному адресу оформляют отдельно от общежития. Уточните порядок по месту проживания и способ передачи новой регистрации в университет.", "Private-address registration is handled separately from dormitory registration. Confirm the process at your residence and how to provide the new registration to the university.")
        rule["office_name_i18n"] = office
        address = "ул. Профессора Попова, 5, корпус 3, кабинет 3423-1"
        rule["contact_i18n"] = bi(office["ru"] + " · " + address, office["en"] + " · 5 Professora Popova Street, Building 3, Room 3423-1")
        if process == "initial_visa":
            rule["contact_i18n"] = bi("Подача на визу: выбранное российское консульство. По приглашению: " + rule["contact_i18n"]["ru"], "Visa application: your chosen Russian consulate. Invitation questions: " + rule["contact_i18n"]["en"])
    for source in rule["source_snapshot"]:
        english_titles={"E2":"LETI: healthcare information for international students", "F1":"Federal Law No. 162-FZ of 10 June 2026", "F2":"Official explanation of medical examination requirements", "F3":"Federal Law No. 109-FZ: migration registration", "F5":"Official explanation of fingerprinting for students", "F6":"Russian consular information: entry conditions by citizenship"}
        if source["id"] in english_titles:
            source["title_i18n"] = bi(source["title"], english_titles[source["id"]])
        if source["id"] == "S1":
            section = ("До въезда. Оформление приглашения" if process in ("invitation", "initial_visa", "trip") else "Порядок въезда в РФ" if process in ("entry_context", "documents") else "Продление срока временного пребывания" if process.endswith("renewal") else "Миграционный учет" if process in ("office", "registration") else "Контакты отдела регистрации и виз")
            english = ("Before entry: invitation" if process in ("invitation", "initial_visa", "trip") else "Entering Russia" if process in ("entry_context", "documents") else "Extending your stay" if process.endswith("renewal") else "Migration registration" if process in ("office", "registration") else "Office contacts")
            source.update(checked_at="2026-10-22", navigation_verified=True, navigation_checked_at="2026-10-22", section_label=section, section_label_i18n=bi(section, english + " (Russian page)"), title_i18n=bi(source["title"], "SUTD: visas and migration registration"))
            source["purpose_i18n"] = bi("Сверьте вузовскую инструкцию для этого шага. Она не подтверждает все персональные правовые условия.", "Check the university instructions for this step. They do not confirm every personal legal condition.")
        elif source["id"] == "E1":
            if process in ("invitation", "initial_visa"):
                source["confidence"] = "U"
                source.update(official_url="https://new.etu.ru/ru/home/international/do-priezda", title="ЛЭТИ: до приезда", title_i18n=bi("ЛЭТИ: до приезда", "LETI: before arrival"), checked_at=None, navigation_verified=False, navigation_checked_at=None, section_label="", purpose_i18n=bi("Уточните в вузе комплект и канал оформления приглашения для вашей программы.", "Ask the university about invitation documents and the application channel for your programme."), verification_note_i18n=bi("Содержимое этой страницы не удалось проверить 22.10.2026. Сроки, комплект и способ получения приглашения здесь не подтверждены.", "The page could not be checked on 22 October 2026. Invitation timing, documents and delivery are not confirmed here."))
            elif process in ("visa_renewal", "registration_renewal"):
                source.update(official_url="https://new.etu.ru/ru/home/international/migracionnoe-soprovozhdenie", title="ЛЭТИ: миграционное сопровождение", title_i18n=bi("ЛЭТИ: миграционное сопровождение", "LETI: migration support"), checked_at="2026-10-22", navigation_verified=True, navigation_checked_at="2026-10-22", section_label="Во время пребывания – продление постановки на миграционный учет", section_label_i18n=bi("Во время пребывания – продление постановки на миграционный учет", "During your stay: registration renewal (Russian page)"), purpose_i18n=bi("Проверьте раздел для своего режима въезда и жилья.", "Check the section for your entry type and housing."))
            else:
                source.update(navigation_verified=False, navigation_checked_at=None, section_label="", title_i18n=bi(source["title"], "LETI: after arrival"), purpose_i18n=bi("Это инструкция первого обращения после приезда, а не подтверждение комплекта всех процедур.", "This covers the first contact after arrival, not the documents for every procedure."), verification_note_i18n=bi("Повторная прямая проверка страницы 22.10.2026 не удалась. Найдено индексированное содержание; актуальный порядок уточните в отделе.", "Direct rechecking failed on 22 October 2026. Indexed content was found; confirm current arrangements with the office."))
        else:
            # Local editorial review does not re-verify historical federal sources.
            source["verification_note_i18n"] = bi("Дата относится к прежней проверке источника. Персональная применимость требует отдельной проверки.", "This date refers to the earlier source review. Personal applicability requires a separate check.")

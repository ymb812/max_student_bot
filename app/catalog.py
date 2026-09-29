"""Versioned source-backed catalog. Federal applicability stays unverified.

No country exemption is inferred from a student's own visa-regime answer.
M09 is orchestration; a separate card exists only for unique review actions.
"""

import json
from app.db import dumps

CHECKED = "2026-09-27"
SOURCES = {
    "S1": (
        "https://prouniver.ru/foreign/visa/",
        "СПбГУПТД: виза и миграционный учёт",
        "СПбГУПТД",
        "P",
    ),
    "E1": (
        "https://new.etu.ru/ru/home/international/po-priezde",
        "ЛЭТИ: по приезде",
        "ЛЭТИ",
        "P",
    ),
    "E2": (
        "https://new.etu.ru/ru/home/studentam/medicina-dlya-studentov/medicina-dlya-inostrancev/",
        "ЛЭТИ: медицина для иностранцев",
        "ЛЭТИ",
        "P",
    ),
    "F1": (
        "https://publication.pravo.gov.ru/document/0001202606100002",
        "162-ФЗ от 10.06.2026",
        "Официальное опубликование",
        "C",
    ),
    "F2": (
        "https://epp.genproc.gov.ru/ru/proc_50/activity/legal-education/explain/e8585073/",
        "Разъяснение медицинского правила",
        "Прокуратура Московской области",
        "C",
    ),
    "F3": (
        "https://www.kremlin.ru/acts/bank/24033/print",
        "109-ФЗ: миграционный учёт",
        "Государство",
        "C",
    ),
    "F5": (
        "https://epp.genproc.gov.ru/ru/proc_64/activity/legal-education/explain/e677934/",
        "Дактилоскопия студентов",
        "Прокуратура",
        "C",
    ),
    "F6": (
        "https://www.kdmid.ru/cons/visas/conditions-of-entry-foreign-citizens-in-russian-federation/",
        "Режим въезда по гражданству",
        "МИД России",
        "C",
    ),
}
CONTACTS = {
    "sutd": "Отдел регистраций и виз / Registration and visa office · Большая Морская, 18, каб. 437А · inter@sutd.ru",
    "leti": "Международный студенческий офис / International student office · ул. Профессора Попова, 5, корп. 3, каб. 3423-1",
}
TITLES = {
    "M01": ("Подготовиться к въезду", "Prepare for entry"),
    "M02": ("Проверить документы въезда", "Check entry documents"),
    "M03": ("Обратиться в офис после приезда", "Contact the office after arrival"),
    "M04": (
        "Оформить учёт по месту проживания",
        "Arrange registration at your residence",
    ),
    "M05": (
        "Уточнить медицинское освидетельствование",
        "Check medical examination requirements",
    ),
    "M06": (
        "Уточнить дактилоскопию и фотографирование",
        "Check fingerprinting and photography",
    ),
    "M07": ("Передать документы для продления визы", "Submit visa extension documents"),
    "M08": ("Подготовить продление учёта", "Prepare to extend registration"),
    "M09": ("Проверить последствия изменения", "Review the change with the office"),
    "M10": ("Уточнить повторный медосмотр", "Check the next medical examination"),
}


def i18n(ru, en):
    return {"ru": ru, "en": en}


def evidence(code):
    url, title, authority, confidence = SOURCES[code]
    return {
        "id": code,
        "source_type": "public_official",
        "official_url": url,
        "title": title,
        "authority": authority,
        "checked_at": CHECKED,
        "confidence": confidence,
        "notes": "Применимость проверяется отдельно / Applicability is assessed separately",
    }


def deadline(
    kind,
    anchor,
    offset,
    unit,
    ru,
    en,
    requirement="unspecified",
    owner="university",
    **kw,
):
    return dict(
        kind=kind,
        owner=owner,
        required_or_recommended=requirement,
        anchor_field=anchor,
        offset=offset,
        unit=unit,
        literal=i18n(ru, en),
        uncertainty="",
        **kw,
    )


def seed_rules():
    result = []
    for tenant in ("sutd", "leti"):
        src = "S1" if tenant == "sutd" else "E1"
        for family in TITLES:
            legal = family in ("M05", "M06", "M10")
            codes = {
                "M01": ["F6", src],
                "M02": ["F6", src],
                "M04": ["F3", src],
                "M05": ["F1", "F2", src],
                "M06": ["F5", src],
                "M10": ["F1", "F2", src],
            }.get(family, [src])
            body = {
                "rule_id": f"{tenant}.{family}",
                "family": family,
                "version": 1,
                "university_id": tenant,
                "layer": "legal" if legal else "university",
                "owner_id": "state" if legal else tenant,
                "mode": "builtin",
                "status": "published",
                "effective_from": "2026-09-01" if legal else CHECKED,
                "eligibility_predicate": {},
                "trigger_types": [],
                "semantic_action_key": family,
                "title_i18n": i18n(*TITLES[family]),
                "action_i18n": i18n(
                    "Уточните применимый порядок в своём офисе.",
                    "Ask your office which procedure applies.",
                ),
                "documents_i18n": i18n(
                    ["Точный пакет уточните в офисе"],
                    ["Ask the office for the exact document list"],
                ),
                "contact": CONTACTS[tenant],
                "deadline_specs": [],
                "source_snapshot": [evidence(c) for c in codes],
                "norm_confidence": "C" if legal else "P",
                "eligibility_confidence": "U" if legal else "P",
                "formula_confidence": "U",
                "source_type": "public_official",
                "uncertainty": "",
                "legal_applicability_verified": False,
            }
            if family == "M01":
                body["action_i18n"] = i18n(
                    "Проверьте режим въезда по гражданству, основание, приглашение и визу. Безвизовым студентам СПбГУПТД очной/очно-заочной формы нужно согласовать дату прибытия."
                    if tenant == "sutd"
                    else "Сверьте подготовку к въезду с инструкцией ЛЭТИ и уточните пакет по своей категории.",
                    "Verify the entry regime, grounds, invitation and visa. SUTD full-time/part-time visa-free students should agree their arrival date."
                    if tenant == "sutd"
                    else "Follow LETI’s pre-arrival instructions and check documents for your category.",
                )
                if tenant == "sutd":
                    body["deadline_specs"] = [
                        deadline(
                            "preparation_start",
                            "education_start",
                            -60,
                            "calendar",
                            "Примерно за 60 календарных дней до занятий: обратиться за приглашением",
                            "Contact the office about an invitation approximately 60 calendar days before classes",
                            "recommended_by_university",
                        )
                    ]
                    body["documents_i18n"] = i18n(
                        ["Анкета", "Копия паспорта; требуемый срок действия уточнить"],
                        ["Application form", "Passport copy; check required validity"],
                    )
            if family == "M02":
                body["action_i18n"] = i18n(
                    "Проверьте паспорт, визу при наличии, миграционную карту при применимости и цель «учёба». Если цель другая — обратитесь в офис.",
                    "Check your passport, visa if applicable, migration card if required and study purpose. Contact the office if the purpose differs.",
                )
            if family == "M03":
                if tenant == "sutd":
                    body["deadline_specs"] = [
                        deadline(
                            "university_submission_deadline",
                            "entry_at",
                            2,
                            "unspecified",
                            "В течение 2 дней после въезда; единицу времени уточнить",
                            "Within 2 days after entry; confirm the unit of time",
                        )
                    ]
                    body["documents_i18n"] = i18n(
                        [
                            "Оригинал паспорта + 3 копии заполненных страниц",
                            "Миграционная карта + 3 копии",
                            "Документ об учёбе + 2 копии",
                            "Нотариальный перевод + 1 копия",
                        ],
                        [
                            "Original passport + 3 copies of completed pages",
                            "Migration card + 3 copies",
                            "Study document + 2 copies",
                            "Notarised translation + 1 copy",
                        ],
                    )
                else:
                    body["deadline_specs"] = [
                        deadline(
                            "university_submission_deadline",
                            "arrival_at",
                            24,
                            "hours",
                            "В первые 24 часа после прибытия в Петербург; в выходной — первый рабочий день. График офиса не подтверждён, точная дата не рассчитана.",
                            "Within 24 hours of arrival in St Petersburg; on a non-working day, the first working day. Office schedule is unverified, so no exact deadline is calculated.",
                        )
                    ]
                    body["documents_i18n"] = i18n(
                        [
                            "Паспорт и копия",
                            "Миграционная карта и копия",
                            "Виза при наличии",
                            "Документ об учёбе по курсу — уточнить",
                        ],
                        [
                            "Passport and copy",
                            "Migration card and copy",
                            "Visa if applicable",
                            "Study document for your year — check with the office",
                        ],
                    )
                body["action_i18n"] = i18n(
                    "Передайте опубликованный пакет в офис. Срок вуза не является федеральным сроком миграционного учёта.",
                    "Submit the listed documents to the office. The university time limit is separate from the statutory registration deadline.",
                )
            if family == "M04":
                body["action_i18n"] = i18n(
                    "В общежитии — через офис. На частном адресе СПбГУПТД — с собственником, затем передать скан обеих сторон регистрации вместе с пакетом для офиса."
                    if tenant == "sutd"
                    else "В общежитии — через офис. На частном адресе — оформить по фактическому адресу и отправить новое уведомление на 2343553@mail.ru. Этот e-mail опубликован именно для регистрации.",
                    "Dormitory: contact the office. SUTD private accommodation: arrange registration with the owner, then send scans of both sides with the office documents."
                    if tenant == "sutd"
                    else "Dormitory: contact the office. Private accommodation: register at the actual address, then send the new notice to 2343553@mail.ru. This email is published specifically for registration.",
                )
                body["deadline_specs"] = [
                    deadline(
                        "legal_deadline",
                        "occurred_at",
                        7,
                        "working",
                        "Общая база: 7 рабочих дней. Договор, исключения и принимающая сторона не проверены — персональная дата не рассчитана.",
                        "General basis: 7 working days. Treaty, exceptions and host are unverified — no personal date is calculated.",
                        "required",
                        "state",
                    )
                ]
                body["residence_actions_i18n"] = {
                    "dorm": i18n(
                        "Для общежития оформите миграционный учёт через соответствующий офис вуза.",
                        "For a dormitory, arrange migration registration through the university office.",
                    ),
                    "private": i18n(
                        "На частном адресе оформите учёт с собственником. Передайте скан обеих сторон регистрации вместе с пакетом для офиса."
                        if tenant == "sutd"
                        else "Оформите регистрацию по фактическому частному адресу. Новое уведомление отправьте на 2343553@mail.ru; этот канал опубликован для регистрации.",
                        "At a private address, arrange registration with the owner. Submit scans of both sides with the office package."
                        if tenant == "sutd"
                        else "Arrange registration at your actual private address. Send the new notice to 2343553@mail.ru; this channel is published for registration.",
                    ),
                    "other": i18n(
                        "Проверьте принимающую сторону и оформление учёта с офисом. Старый документ не объявляется автоматически аннулированным.",
                        "Check the host and registration procedure with the office. The previous document is not automatically declared void.",
                    ),
                }
            if family in ("M05", "M06", "M10"):
                descriptions = {
                    "M05": (
                        "В исследовании: 30 календарных дней со въезда для подпадающих категорий с 01.09.2026. Исключения и начало отсчёта не проверены для вас.",
                        "Research indicates 30 calendar days from entry for eligible categories from 1 September 2026. Your exemptions and counting basis are unverified.",
                    ),
                    "M06": (
                        "В исследовании: 90 календарных дней со въезда для подпадающих категорий, однократно. Исключения не проверены для вас.",
                        "Research indicates 90 calendar days from entry for eligible categories, once. Your exemptions are unverified.",
                    ),
                    "M10": (
                        "В исследовании: после года со дня предыдущего осмотра — следующее 30-дневное окно. Применимость, переходные случаи и формула года требуют проверки.",
                        "Research indicates a 30-day window after one year from the previous examination. Applicability, transitional cases and year-counting need verification.",
                    ),
                }
                body["action_i18n"] = i18n(*descriptions[family])
                body["deadline_specs"] = [
                    deadline(
                        "legal_deadline",
                        "last_medical_completed_at" if family == "M10" else "entry_at",
                        None if family == "M10" else (30 if family == "M05" else 90),
                        "calendar",
                        *descriptions[family],
                        "required",
                        "state",
                    )
                ]
            if family == "M07":
                body["action_i18n"] = i18n(
                    "Передайте в свой офис документы для продления визы. Передача документов не означает выдачу новой визы.",
                    "Submit visa extension documents to your office. Submission does not mean a new visa has been issued.",
                )
                body["deadline_specs"] = [
                    deadline(
                        "university_submission_deadline",
                        "visa_expiry",
                        -60 if tenant == "sutd" else -45,
                        "calendar" if tenant == "sutd" else "unspecified",
                        "Рекомендуемый вузом срок обращения: за 60 календарных дней до окончания визы"
                        if tenant == "sutd"
                        else "Не позже чем за 45 дней до окончания визы; единица времени не уточнена",
                        "University recommendation: contact the office 60 calendar days before visa expiry"
                        if tenant == "sutd"
                        else "No later than 45 days before visa expiry; time unit unconfirmed",
                        "recommended_by_university"
                        if tenant == "sutd"
                        else "unspecified",
                    ),
                    deadline(
                        "document_expiry",
                        "visa_expiry",
                        0,
                        "calendar",
                        "Окончание визы: факт по данным пользователя",
                        "Visa expiry: user-reported document fact",
                        "document_fact",
                        "user",
                    ),
                ]
            if family == "M08":
                body["deadline_specs"] = [
                    deadline(
                        "university_submission_deadline",
                        "registration_expiry",
                        -50 if tenant == "sutd" else -45,
                        "calendar" if tenant == "sutd" else "unspecified",
                        "Рекомендуемый вузом срок: за 50 календарных дней, только для регистрации по общежитию"
                        if tenant == "sutd"
                        else "Не позже чем за 45 дней до окончания регистрации; единица времени не уточнена",
                        "University recommendation: 50 calendar days before expiry, for dormitory registration only"
                        if tenant == "sutd"
                        else "No later than 45 days before registration expiry; time unit unconfirmed",
                        "recommended_by_university"
                        if tenant == "sutd"
                        else "unspecified",
                    ),
                    deadline(
                        "document_expiry",
                        "registration_expiry",
                        0,
                        "calendar",
                        "Окончание регистрации: факт по данным пользователя",
                        "Registration expiry: user-reported document fact",
                        "document_fact",
                        "user",
                    ),
                ]
            if family == "M09":
                body["action_i18n"] = i18n(
                    "После гостиницы, замены паспорта или изменения статуса проверьте порядок у офиса. Старый учёт не объявляется автоматически аннулированным.",
                    "After a hotel stay, passport replacement or status change, check the procedure with the office. Prior registration is not automatically declared void.",
                )
            result.append(body)
    return result


def seed(db):
    for rule in seed_rules():
        rows = db.execute(
            "SELECT * FROM rules WHERE rule_id=? ORDER BY version DESC",
            (rule["rule_id"],),
        ).fetchall()
        source = next((r for r in rows if r["created_by"] == "source_catalog"), None)
        if source:
            old = json.loads(source["body"])
            compare_old = {
                k: v for k, v in old.items() if k not in ("version", "status")
            }
            compare_new = {
                k: v for k, v in rule.items() if k not in ("version", "status")
            }
            if compare_old == compare_new:
                continue
        rule["version"] = max([r["version"] for r in rows], default=0) + 1
        db.execute(
            "UPDATE rules SET status='archived' WHERE rule_id=? AND created_by='source_catalog' AND status='published'",
            (rule["rule_id"],),
        )
        db.execute(
            "INSERT INTO rules VALUES(?,?,?,?,?,?,?,?)",
            (
                rule["rule_id"],
                rule["version"],
                rule["university_id"],
                rule["layer"],
                "published",
                dumps(rule),
                "source_catalog",
                CHECKED,
            ),
        )

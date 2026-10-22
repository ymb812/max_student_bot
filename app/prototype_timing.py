"""Explicit hackathon timing assumptions, opt-in only; see PROTOTYPE_TIMING.md."""
from copy import deepcopy
from datetime import date, timedelta

VERSION = "hackathon-2026-10-22-v1"


def bi(ru, en):
    return {"ru": ru, "en": en}


def prototype_rule(original):
    rule = deepcopy(original)
    if rule.get("mode") == "custom":
        return rule
    family = rule["family"]
    assumptions = []
    for spec in rule["deadline_specs"]:
        kind, unit = spec["kind"], spec["unit"]
        if kind == "document_expiry":
            continue
        if kind != "legal_deadline" and unit not in ("working", "hours", "unspecified"):
            continue
        spec["prototype_original"] = deepcopy(spec)
        spec["prototype_assumption"] = VERSION
        spec.pop("literal_explains_calculation", None)
        spec["uncertainty"] = "prototype_assumption"
        if kind == "legal_deadline":
            texts = {
                "M04": ("В течение 7 рабочих дней после прибытия по месту проживания", "Within 7 working days of arrival at your accommodation"),
                "M05": ("В течение 30 календарных дней после въезда", "Within 30 calendar days after entry"),
                "M06": ("В течение 90 календарных дней после въезда", "Within 90 calendar days after entry"),
                "M10": ("В течение 30 календарных дней после годовщины предыдущего медосмотра", "Within 30 calendar days after the anniversary of your previous medical examination"),
            }
            spec["literal"] = bi(*texts[family])
            if family == "M10":
                spec["prototype_formula"] = "anniversary_plus_30"
        elif unit == "hours":
            spec["prototype_formula"] = "next_weekday"
            spec["literal"] = bi("Не позднее следующего рабочего дня после прибытия в Петербург", "By the next working day after arrival in St Petersburg")
        elif unit == "unspecified":
            spec["unit"] = "working"
        if spec["required_or_recommended"] == "unspecified":
            spec["required_or_recommended"] = "required"
        assumptions.append({"kind": kind, "anchor": spec["anchor_field"], "unit": spec["unit"], "offset": spec.get("offset")})
    if assumptions:
        rule["prototype_timing"] = {"version": VERSION, "assumptions": assumptions}
    actions = {
        "M05": ("Пройдите медицинское освидетельствование. Сохраните выданные медицинские документы.", "Complete a medical examination. Keep the medical documents you receive."),
        "M06": ("Пройдите дактилоскопию и фотографирование. Сохраните документ о прохождении процедуры.", "Complete fingerprinting and photography. Keep the confirmation document."),
        "M10": ("Пройдите повторное медицинское освидетельствование. Сохраните новые медицинские документы.", "Complete a repeat medical examination. Keep your new medical documents."),
    }
    if family in actions:
        rule["action_i18n"] = bi(*actions[family])
        rule["title_i18n"] = bi(*{
            "M05": ("Пройти медосмотр", "Complete a medical examination"),
            "M06": ("Пройти дактилоскопию и фотографирование", "Complete fingerprinting and photography"),
            "M10": ("Пройти повторный медосмотр", "Complete a repeat medical examination"),
        }[family])
        rule["expected_result_i18n"] = bi("Дактилоскопия и фотографирование пройдены", "Fingerprinting and photography completed") if family == "M06" else bi("Медосмотр пройден; дата сохранена для следующего осмотра", "Medical examination completed; its date is recorded for the next examination")
    return rule


def prototype_date(spec, anchor):
    """Calendar dates, weekdays without holidays, and an explicit anniversary model."""
    current = date.fromisoformat(str(anchor)[:10])
    formula = spec.get("prototype_formula")
    if formula == "anniversary_plus_30":
        try:
            anniversary = current.replace(year=current.year + 1)
        except ValueError:  # 29 February -> 28 February in a non-leap year.
            anniversary = current.replace(year=current.year + 1, day=28)
        return (anniversary + timedelta(days=30)).isoformat()
    if formula == "next_weekday":
        current += timedelta(days=1)
        while current.weekday() >= 5:
            current += timedelta(days=1)
        return current.isoformat()
    offset = spec.get("offset")
    if offset is None:
        return None
    if spec["unit"] == "calendar":
        return (current + timedelta(days=offset)).isoformat()
    if spec["unit"] == "working":
        direction, remaining = (1 if offset >= 0 else -1), abs(offset)
        while remaining:
            current += timedelta(days=direction)
            if current.weekday() < 5:
                remaining -= 1
        return current.isoformat()
    return None

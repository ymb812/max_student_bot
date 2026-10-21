from datetime import date, datetime, timedelta, timezone

# Moscow uses UTC+3. Keep event audit timestamps in UTC, calendar dates in MSK.
MSK = timezone(timedelta(hours=3))


def moscow_today():
    return datetime.now(MSK).date()


def working_date(anchor, offset, calendar):
    """Exclude the anchor; every visited date must exist in a verified calendar.

    No production calendar is bundled. Tests pass explicit synthetic calendars,
    including holidays and transferred working weekends; weekdays are not assumed.
    """
    if not calendar or not calendar.get("verified") or not calendar.get("version"):
        return None
    current = date.fromisoformat(str(anchor)[:10])
    direction = 1 if offset >= 0 else -1
    remaining = abs(offset)
    while remaining:
        current += timedelta(days=direction)
        works = calendar.get("days", {}).get(current.isoformat())
        if not isinstance(works, bool):
            return None
        if works:
            remaining -= 1
    return current.isoformat()

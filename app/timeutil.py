from datetime import datetime, timedelta, timezone

# Moscow uses UTC+3. Keep event audit timestamps in UTC, calendar dates in MSK.
MSK = timezone(timedelta(hours=3))


def moscow_today():
    return datetime.now(MSK).date()

import asyncio
import hashlib
import json
import time
import ssl
import httpx
from app.db import dumps
from app.config import ROOT
from app.timeutil import moscow_today
from app.service import stamp, enqueue, recalculate


class MaxClient:
    def __init__(self, settings):
        self.settings = settings
        self.tls = ssl.create_default_context()
        self.tls.load_verify_locations(
            cafile=str(ROOT / "app/certs/russian_trusted_root_ca.pem")
        )

    async def request(self, method, path, **kwargs):
        async with httpx.AsyncClient(timeout=40, verify=self.tls) as client:
            response = await client.request(
                method,
                self.settings.max_api_url + path,
                headers={"Authorization": self.settings.max_bot_token},
                **kwargs,
            )
            response.raise_for_status()
            return response.json()

    async def send(self, max_id, text, task_key=None):
        username = self.settings.max_bot_username
        url = (
            f"https://max.ru/{username}?startapp=roadmap"
            if username
            else self.settings.public_base_url
        )
        if username and task_key:
            # The destination route still checks ownership server-side.
            url = f"https://max.ru/{username}?startapp=task_{hashlib.sha256(task_key.encode()).hexdigest()[:24]}"
        body = {
            "text": text,
            "attachments": [
                {
                    "type": "inline_keyboard",
                    "payload": {
                        "buttons": [
                            [
                                {
                                    "type": "link",
                                    "text": "Открыть план / Open roadmap",
                                    "url": url,
                                }
                            ]
                        ]
                    },
                }
            ],
        }
        return await self.request(
            "POST", "/messages", params={"user_id": max_id}, json=body
        )


def accept_update(db, update):
    typ = update.get("update_type")
    message = update.get("message") or {}
    mid = (message.get("body") or {}).get("mid")
    user = update.get("user") or message.get("sender") or {}
    user_id = user.get("user_id")
    if typ not in ("bot_started", "message_created") or not isinstance(user_id, int):
        return
    key = (
        mid
        or hashlib.sha256(
            dumps(
                {"type": typ, "user_id": user_id, "timestamp": update.get("timestamp")}
            ).encode()
        ).hexdigest()
    )
    if mid:
        key = hashlib.sha256(str(mid).encode()).hexdigest()
    # No raw message, names or documents are persisted.
    db.execute(
        "INSERT OR IGNORE INTO inbox(id,body) VALUES(?,?)",
        (
            key,
            dumps(
                {
                    "type": typ,
                    "max_user_id": user_id,
                    "expires_at": int(time.time()) + 86400,
                }
            ),
        ),
    )


async def worker(database, settings):
    client = MaxClient(settings)
    last_maintenance = 0
    while True:
        try:
            now = int(time.time())
            with database.transaction() as db:
                # Process durable updates into navigation messages.
                for row in db.execute(
                    "SELECT * FROM inbox WHERE status='pending' LIMIT 20"
                ).fetchall():
                    body = json.loads(row["body"])
                    expiry = body.get("expires_at", now + 86400)
                    if expiry > now:
                        enqueue(
                            db,
                            "bot-navigation",
                            "inbox:" + row["id"],
                            {
                                "kind": "navigation",
                                "max_user_id": body["max_user_id"],
                                "expires_at": expiry,
                            },
                        )
                    db.execute(
                        "UPDATE inbox SET status='done',body=? WHERE id=?",
                        (dumps({"type": "processed"}), row["id"]),
                    )
                db.execute(
                    "UPDATE outbox SET status='cancelled',body=? WHERE user_id='bot-navigation' AND json_extract(body,'$.expires_at')<=? AND status NOT IN ('sent','cancelled')",
                    (dumps({"kind": "navigation"}), now),
                )
                db.execute(
                    "UPDATE outbox SET body=? WHERE user_id='bot-navigation' AND status IN ('sent','cancelled')",
                    (dumps({"kind": "navigation"}),),
                )
                if now - last_maintenance >= 3600:
                    for user in db.execute("SELECT id,profile FROM users").fetchall():
                        recalculate(db, user["id"], "time_refresh", notify=False)
                        profile = json.loads(user["profile"])
                        if profile["reminders_enabled"] and profile["consent"]:
                            for row in db.execute(
                                "SELECT * FROM tasks WHERE user_id=?", (user["id"],)
                            ).fetchall():
                                task = json.loads(row["body"])
                                if (
                                    row["user_status"] == "completed"
                                    or task["engine_status"] != "actionable"
                                ):
                                    continue
                                due = [
                                    d
                                    for d in task["dates"]
                                    if d["kind"]
                                    in (
                                        "preparation_start",
                                        "university_submission_deadline",
                                    )
                                    and d["computed_at"]
                                    and d["computed_at"][:10]
                                    == moscow_today().isoformat()
                                ]
                                if due:
                                    enqueue(
                                        db,
                                        user["id"],
                                        f"reminder:{task['task_key']}:{task['rule_version']}:{due[0]['computed_at']}",
                                        {
                                            "kind": "reminder",
                                            "language": profile["language"],
                                            "task_key": task["task_key"],
                                            "demo_model": task["demo_model"],
                                            "title_i18n": task["title_i18n"],
                                            "timing": due[0],
                                        },
                                    )
                    db.execute("DELETE FROM sessions WHERE expires_at<?", (now,))
                    db.execute("DELETE FROM candidates WHERE expires_at<?", (now,))
                    # Retention concerns student data only. Version/source history is retained.
                    cutoff = datetime_cutoff(settings.retention_days)
                    for user in db.execute(
                        "SELECT id FROM users WHERE updated_at<?", (cutoff,)
                    ).fetchall():
                        delete_user(db, user["id"])
                    last_maintenance = now
                db.execute(
                    "UPDATE outbox SET status='pending' WHERE status='sending' AND next_attempt_at<=?",
                    (now,),
                )
                rows = (
                    db.execute(
                        "SELECT * FROM outbox WHERE status='pending' AND next_attempt_at<=? LIMIT 10",
                        (now,),
                    ).fetchall()
                    if settings.max_bot_token and settings.bot_transport != "disabled"
                    else []
                )
                for row in rows:
                    db.execute(
                        "UPDATE outbox SET status='sending',attempts=attempts+1,next_attempt_at=? WHERE id=?",
                        (now + 120, row["id"]),
                    )
            for row in rows:
                body = json.loads(row["body"])
                with database.transaction() as db:
                    user = db.execute(
                        "SELECT max_user_id,profile FROM users WHERE id=?",
                        (row["user_id"],),
                    ).fetchone()
                max_id = body.get("max_user_id") or (
                    user["max_user_id"] if user else None
                )
                if body["kind"] != "navigation" and (
                    not user or not json.loads(user["profile"])["consent"]
                ):
                    with database.transaction() as db:
                        db.execute(
                            "UPDATE outbox SET status='cancelled' WHERE id=?",
                            (row["id"],),
                        )
                    continue
                if not max_id:
                    with database.transaction() as db:
                        db.execute(
                            "UPDATE outbox SET status='skipped',last_error='No MAX identity' WHERE id=?",
                            (row["id"],),
                        )
                    continue
                en = body.get("language") == "en"
                if body["kind"] == "navigation":
                    text = "Добро пожаловать! Выберите язык и вуз в мини-приложении. Ваш план сохранится после каждого действия. / Welcome! Choose your language and university in the mini-app."
                elif body["kind"] == "reminder":
                    text = (
                        "A university preparation or submission date has arrived. Check the card and its source."
                        if en
                        else "Наступила дата подготовки или обращения по инструкции вуза. Проверьте карточку и источник срока."
                    )
                    if body.get("title_i18n"):
                        text += "\n" + body["title_i18n"]["en" if en else "ru"]
                    text += describe_timing(body.get("timing"), en)
                else:
                    text = (
                        f"Your roadmap changed: {body['changed_count']} updates. Review deadlines and their owners; uncertain dates require an office check."
                        if en
                        else f"Ваш план обновлён: {body['changed_count']} изменений. Проверьте сроки и их владельцев; неопределённые даты уточните в офисе."
                    )
                    for change in body.get("changes", []):
                        text += "\n• " + change["title_i18n"]["en" if en else "ru"]
                        if change.get("timing"):
                            text += describe_timing(change["timing"], en)
                        else:
                            text += ": " + (
                                change["date"]
                                or (
                                    "check with the office"
                                    if en
                                    else "уточнить в офисе"
                                )
                            )
                if body.get("demo_model"):
                    text += (
                        "\nDemonstration university rule change."
                        if en
                        else "\nДемонстрационное изменение университетского правила."
                    )
                try:
                    await client.send(max_id, text, body.get("task_key"))
                    with database.transaction() as db:
                        db.execute(
                            "UPDATE outbox SET status='sent',sent_at=?,last_error=NULL WHERE id=?",
                            (stamp(), row["id"]),
                        )
                except (httpx.HTTPError, ValueError) as exc:
                    # Never store exception URL, request headers or the token.
                    with database.transaction() as db:
                        db.execute(
                            "UPDATE outbox SET status='pending',next_attempt_at=?,last_error=? WHERE id=?",
                            (
                                now + min(3600, 2 ** min(row["attempts"] + 1, 11)),
                                type(exc).__name__,
                                row["id"],
                            ),
                        )
        except asyncio.CancelledError:
            raise
        except Exception:
            # Restart the durable work loop; no private request payload in logs.
            import logging

            logging.getLogger(__name__).error("Worker iteration failed; will retry")
        await asyncio.sleep(5)


def describe_timing(timing, en):
    if not timing:
        return ""
    owner = {
        "university": ("Вуз", "University"),
        "state": ("Государство", "State"),
        "user": ("Дата документа пользователя", "User document date"),
        "product": ("Приложение", "App"),
    }.get(timing["owner"], ("Уточнить", "Check with office"))[int(en)]
    requirement = {
        "recommended_by_university": ("Рекомендация вуза", "University recommendation"),
        "required": ("Срок из инструкции", "Time limit in the instruction"),
        "unspecified": (
            "Характер срока не подтверждён",
            "Timing requirement unverified",
        ),
    }.get(timing["required_or_recommended"], ("Подготовка", "Preparation"))[int(en)]
    when = timing.get("computed_at")
    if when:
        when += " (MSK)" if en else " (МСК)"
    else:
        when = (
            "check applicability and timing with the office"
            if en
            else "применимость и срок уточнить в офисе"
        )
    return (
        "\n  "
        + requirement
        + ": "
        + when
        + ". "
        + ("Owner: " if en else "Владелец: ")
        + owner
        + "."
    )


def datetime_cutoff(days):
    from datetime import datetime, timezone, timedelta

    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def delete_user(db, user_id):
    user = db.execute("SELECT max_user_id FROM users WHERE id=?", (user_id,)).fetchone()
    if user and user["max_user_id"]:
        db.execute(
            "UPDATE inbox SET status='done',body=? WHERE json_extract(body,'$.max_user_id')=?",
            (dumps({"type": "processed"}), user["max_user_id"]),
        )
        db.execute(
            "DELETE FROM outbox WHERE user_id='bot-navigation' AND json_extract(body,'$.max_user_id')=?",
            (user["max_user_id"],),
        )
    for table in ("events", "tasks", "revisions", "outbox", "candidates", "sessions"):
        db.execute(f"DELETE FROM {table} WHERE user_id=?", (user_id,))
    db.execute("DELETE FROM users WHERE id=?", (user_id,))


async def poll_updates(database, settings):
    client = MaxClient(settings)
    while True:
        try:
            with database.transaction() as db:
                row = db.execute(
                    "SELECT value FROM metadata WHERE key='max_marker'"
                ).fetchone()
            params = {
                "timeout": 25,
                "limit": 50,
                "types": "bot_started,message_created",
            }
            if row:
                params["marker"] = int(row["value"])
            result = await client.request("GET", "/updates", params=params)
            with database.transaction() as db:
                for update in result.get("updates", []):
                    accept_update(db, update)
                if result.get("marker") is not None:
                    db.execute(
                        "INSERT OR REPLACE INTO metadata VALUES('max_marker',?)",
                        (str(result["marker"]),),
                    )
        except asyncio.CancelledError:
            raise
        except (httpx.HTTPError, ValueError):
            await asyncio.sleep(10)

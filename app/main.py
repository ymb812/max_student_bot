import asyncio
import hashlib
import hmac
import json
import secrets
import time
from contextlib import asynccontextmanager, suppress
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.auth import validate_launch_data
from app.catalog import seed
from app.config import ROOT, Settings
from app.db import Database, dumps
from app.language import propose_event
from app.max_client import accept_update, delete_user, poll_updates, worker
from app.models import (
    AuthRequest,
    CandidateConfirm,
    EditorLogin,
    EventInput,
    Profile,
    PublicationRequest,
    RuleDraft,
    TaskStatus,
    TextRequest,
)
from app.service import (
    draft_body,
    events_for,
    preview_publication,
    recalculate,
    record_event,
    snapshot,
    stamp,
    uid,
    validate_rule,
    simulate_rule,
)
from app.responses import (
    AuthResponse,
    RoadmapResponse,
    EventResponse,
    RulesResponse,
    PreviewResponse,
)
from app.timeutil import moscow_today


def create_app(settings=None):
    settings = settings or Settings()
    database = Database(settings.database_path)
    with database.transaction() as db:
        seed(db)

    @asynccontextmanager
    async def lifespan(app):
        jobs = [asyncio.create_task(worker(database, settings))]
        if settings.bot_transport == "polling" and settings.max_bot_token:
            jobs.append(asyncio.create_task(poll_updates(database, settings)))
        yield
        for job in jobs:
            job.cancel()
        for job in jobs:
            with suppress(asyncio.CancelledError):
                await job

    app = FastAPI(
        title="MAX Foreign Students API",
        version="1.0.0",
        lifespan=lifespan,
        description="Stateful student roadmap. Demo editor roles and rule changes are explicitly modelled.",
        servers=[{"url": settings.public_base_url}],
    )
    app.state.database = database
    app.state.settings = settings
    bearer = HTTPBearer(auto_error=False)

    @app.middleware("http")
    async def headers(request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        elif request.url.path.startswith("/static/") or request.url.path in ("/", "/admin"):
            response.headers["Cache-Control"] = "no-cache"
        if request.url.path in ("/", "/admin"):
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; script-src 'self' https://st.max.ru; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors https://*.max.ru https://max.ru; base-uri 'none'; form-action 'self'"
            )
        return response

    def session(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
        if not credentials:
            raise HTTPException(401, "Authentication required")
        with database.transaction() as db:
            row = db.execute(
                "SELECT * FROM sessions WHERE token=? AND expires_at>?",
                (
                    hashlib.sha256(credentials.credentials.encode()).hexdigest(),
                    int(time.time()),
                ),
            ).fetchone()
        if not row:
            raise HTTPException(401, "Session expired; open the app again")
        if row["role"] == "student":
            with database.transaction() as db:
                db.execute(
                    "UPDATE users SET updated_at=? WHERE id=?",
                    (stamp(), row["user_id"]),
                )
        return dict(row)

    def student(s=Depends(session)):
        if s["role"] != "student":
            raise HTTPException(403, "Student role required")
        return s

    def editor(s=Depends(session)):
        if s["role"] not in ("university_editor", "maintainer"):
            raise HTTPException(403, "Editor role required")
        return s

    def issue_session(db, user_id, role, tenant=None):
        token = secrets.token_urlsafe(32)
        db.execute(
            "INSERT INTO sessions VALUES(?,?,?,?,?)",
            (
                hashlib.sha256(token.encode()).hexdigest(),
                user_id,
                role,
                tenant,
                int(time.time()) + settings.session_ttl_seconds,
            ),
        )
        return {
            "access_token": token,
            "token_type": "bearer",
            "role": role,
            "tenant": tenant,
            "demo_model": role != "student" or user_id.startswith("demo-"),
        }

    @app.get("/health", tags=["Operations"])
    def health():
        return {
            "status": "ok",
            "version": app.version,
            "bot_transport": settings.bot_transport,
        }

    @app.get("/api/config", tags=["Authentication"])
    def config():
        return {
            "demo_mode": settings.demo_mode,
            "llm_enabled": bool(settings.llm_base_url and settings.llm_model),
            "universities": ["sutd", "leti"],
            "privacy_retention_days": settings.retention_days,
        }

    @app.post("/api/auth/max", response_model=AuthResponse, tags=["Authentication"])
    def max_auth(body: AuthRequest):
        max_id = validate_launch_data(body.init_data, settings.max_bot_token)
        with database.transaction() as db:
            row = db.execute(
                "SELECT id FROM users WHERE max_user_id=?", (max_id,)
            ).fetchone()
            user_id = row["id"] if row else uid()
            if not row:
                db.execute(
                    "INSERT INTO users VALUES(?,?,?,?)",
                    (
                        user_id,
                        max_id,
                        dumps(Profile().model_dump(mode="json")),
                        stamp(),
                    ),
                )
            db.execute("UPDATE users SET updated_at=? WHERE id=?", (stamp(), user_id))
            return issue_session(db, user_id, "student")

    @app.post("/api/auth/demo", response_model=AuthResponse, tags=["Authentication"])
    def demo_auth():
        if not settings.demo_mode:
            raise HTTPException(404, "Demo access disabled")
        with database.transaction() as db:
            user_id = "demo-" + uid()
            db.execute(
                "INSERT INTO users VALUES(?,?,?,?)",
                (user_id, None, dumps(Profile().model_dump(mode="json")), stamp()),
            )
            return issue_session(db, user_id, "student")

    @app.post("/api/auth/editor", response_model=AuthResponse, tags=["Authentication"])
    def editor_auth(body: EditorLogin):
        for key, role, tenant in (
            (settings.editor_sutd_key, "university_editor", "sutd"),
            (settings.editor_leti_key, "university_editor", "leti"),
            (settings.maintainer_key, "maintainer", None),
        ):
            if key and hmac.compare_digest(body.key, key):
                with database.transaction() as db:
                    return issue_session(
                        db, "editor-" + (tenant or "maintainer"), role, tenant
                    )
        raise HTTPException(401, "Invalid editor key")

    @app.get("/api/me/profile", response_model=Profile, tags=["Student"])
    def get_profile(s=Depends(student)):
        with database.transaction() as db:
            user = db.execute(
                "SELECT profile FROM users WHERE id=?", (s["user_id"],)
            ).fetchone()
            if not user:
                raise HTTPException(404, "Profile not found")
            return json.loads(user["profile"])

    @app.patch("/api/me/profile", response_model=Profile, tags=["Student"])
    def update_profile(body: Profile, s=Depends(student)):
        with database.transaction() as db:
            old = db.execute(
                "SELECT profile FROM users WHERE id=?", (s["user_id"],)
            ).fetchone()
            old_profile = json.loads(old["profile"])
            if (
                old_profile["university_id"]
                and body.university_id != old_profile["university_id"]
            ):
                raise HTTPException(
                    409,
                    "University transfer requires an office review; use enrolment_changed",
                )
            if old_profile["consent"] and not body.consent:
                raise HTTPException(409, "Use profile deletion to withdraw consent")
            db.execute(
                "UPDATE users SET profile=?,updated_at=? WHERE id=?",
                (dumps(body.model_dump(mode="json")), stamp(), s["user_id"]),
            )
            recalculate(db, s["user_id"], "profile_updated")
            return body

    @app.delete("/api/me/profile", tags=["Student"])
    def remove_profile(s=Depends(student)):
        with database.transaction() as db:
            delete_user(db, s["user_id"])
        return {"deleted": True}

    @app.get("/api/me/roadmap", response_model=RoadmapResponse, tags=["Student"])
    def roadmap(s=Depends(student)):
        with database.transaction() as db:
            recalculate(db, s["user_id"], "time_refresh", notify=False)
            calculated = snapshot(db, s["user_id"])
            tasks = [
                {
                    **json.loads(r["body"]),
                    "user_status": r["user_status"],
                    "completed_at": r["completed_at"],
                    "deep_link_id": hashlib.sha256(r["task_key"].encode()).hexdigest()[
                        :24
                    ],
                }
                for r in db.execute(
                    "SELECT * FROM tasks WHERE user_id=?", (s["user_id"],)
                )
            ]
            facts = {
                k: v for k, v in calculated["facts"].items() if not k.startswith("_")
            }
            return {
                "tasks": tasks,
                "decisions": calculated["decisions"],
                "effective_profile": facts,
                "timezone": "Europe/Moscow",
                "demo_model": s["user_id"].startswith("demo-"),
            }

    @app.patch("/api/me/tasks/{task_key}/status", tags=["Student"])
    def change_status(task_key: str, body: TaskStatus, s=Depends(student)):
        with database.transaction() as db:
            row = db.execute(
                "SELECT * FROM tasks WHERE task_key=? AND user_id=?",
                (task_key, s["user_id"]),
            ).fetchone()
            if not row:
                raise HTTPException(404, "Task not found")
            task = json.loads(row["body"])
            if task["engine_status"] == "superseded":
                raise HTTPException(409, "This task has been superseded")
            if (
                task.get("completion_basis") == "reported_fact"
                and body.status != "completed"
            ):
                raise HTTPException(
                    409, "Correct or retract the reported procedure event first"
                )
            if row["user_status"] != body.status:
                completed = stamp() if body.status == "completed" else None
                db.execute(
                    "UPDATE tasks SET user_status=?,completed_at=? WHERE task_key=?",
                    (body.status, completed, task_key),
                )
                db.execute(
                    "INSERT INTO revisions VALUES(?,?,?,?,?,?)",
                    (
                        uid(),
                        s["user_id"],
                        "user_status_changed",
                        None,
                        stamp(),
                        dumps(
                            [
                                {
                                    "task_key": task_key,
                                    "before": {
                                        **task,
                                        "user_status": row["user_status"],
                                        "completed_at": row["completed_at"],
                                    },
                                    "after": {
                                        **task,
                                        "user_status": body.status,
                                        "completed_at": completed,
                                    },
                                }
                            ]
                        ),
                    ),
                )
            return {
                "task_key": task_key,
                "user_status": body.status,
                "verification": "user_attested",
            }

    @app.get("/api/me/events", tags=["Events"])
    def list_events(s=Depends(student)):
        with database.transaction() as db:
            return {"events": events_for(db, s["user_id"])}

    def event_revision_id(db, user_id, event_id, reason=None):
        row = db.execute(
            "SELECT id FROM revisions WHERE user_id=? AND trigger_id=? "
            "AND (? IS NULL OR reason=?) ORDER BY created_at DESC,id DESC LIMIT 1",
            (user_id, event_id, reason, reason),
        ).fetchone()
        return row["id"] if row else None

    @app.post(
        "/api/me/events", response_model=EventResponse, status_code=201, tags=["Events"]
    )
    def post_event(body: EventInput, s=Depends(student)):
        with database.transaction() as db:
            event_id, created = record_event(db, s["user_id"], body)
            revision_id = event_revision_id(
                db, s["user_id"], event_id,
                "event_corrected" if body.supersedes_event_id else body.type,
            )
        return {
            "event_id": event_id,
            "created": created,
            "verification": "user_attested",
            "revision_id": revision_id,
        }

    @app.delete("/api/me/events/{event_id}", tags=["Events"])
    def retract_event(event_id: str, s=Depends(student)):
        with database.transaction() as db:
            row = db.execute(
                "SELECT * FROM events WHERE id=? AND user_id=?",
                (event_id, s["user_id"]),
            ).fetchone()
            if not row:
                raise HTTPException(404, "Event not found")
            if not row["retracted_at"]:
                if db.execute(
                    "SELECT id FROM events WHERE supersedes_event_id=? AND retracted_at IS NULL",
                    (event_id,),
                ).fetchone():
                    raise HTTPException(409, "Retract the replacement event first")
                db.execute(
                    "UPDATE events SET retracted_at=? WHERE id=?", (stamp(), event_id)
                )
                recalculate(db, s["user_id"], "event_retracted", event_id, force_revision=True)
            revision_id = event_revision_id(db, s["user_id"], event_id, "event_retracted")
        return {"event_id": event_id, "retracted": True, "revision_id": revision_id}

    @app.get("/api/me/history/{revision_id}", tags=["Student"])
    def history_revision(revision_id: str, s=Depends(student)):
        with database.transaction() as db:
            row = db.execute(
                "SELECT * FROM revisions WHERE id=? AND user_id=?",
                (revision_id, s["user_id"]),
            ).fetchone()
            if not row:
                raise HTTPException(404, "Revision not found")
            return {**dict(row), "changes": json.loads(row["changes"])}

    @app.get("/api/me/history", tags=["Student"])
    def history(offset: int = Query(default=0, ge=0), s=Depends(student)):
        with database.transaction() as db:
            rows = db.execute(
                "SELECT * FROM revisions WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 101 OFFSET ?",
                (s["user_id"], offset),
            ).fetchall()
            return {
                "revisions": [
                    {**dict(r), "changes": json.loads(r["changes"])}
                    for r in rows[:100]
                ],
                "next_offset": offset + 100 if len(rows) > 100 else None,
            }

    @app.post("/api/me/candidates", tags=["Language"])
    async def candidate(body: TextRequest, s=Depends(student)):
        result = await propose_event(body.text, settings)
        if result["candidate"]:
            with database.transaction() as db:
                cid = uid()
                db.execute(
                    "INSERT INTO candidates VALUES(?,?,?,?,NULL)",
                    (
                        cid,
                        s["user_id"],
                        dumps(result["candidate"]),
                        int(time.time()) + 3600,
                    ),
                )
            result["candidate_id"] = cid
        return result

    @app.post("/api/me/candidates/{candidate_id}/confirm", tags=["Language"])
    def confirm_candidate(
        candidate_id: str, body: CandidateConfirm, s=Depends(student)
    ):
        with database.transaction() as db:
            row = db.execute(
                "SELECT * FROM candidates WHERE id=? AND user_id=? AND expires_at>?",
                (candidate_id, s["user_id"], int(time.time())),
            ).fetchone()
            if not row:
                raise HTTPException(404, "Candidate expired or not found")
            if row["confirmed_event_id"]:
                return {
                    "event_id": row["confirmed_event_id"], "created": False,
                    "revision_id": event_revision_id(
                        db, s["user_id"], row["confirmed_event_id"],
                        json.loads(row["body"])["type"],
                    ),
                }
            try:
                event = EventInput(
                    **body.model_dump(), type=json.loads(row["body"])["type"]
                )
            except ValueError:
                raise HTTPException(
                    422, "Please complete the structured event fields"
                ) from None
            eid, created = record_event(db, s["user_id"], event)
            db.execute(
                "UPDATE candidates SET confirmed_event_id=? WHERE id=?",
                (eid, candidate_id),
            )
            return {
                "event_id": eid, "created": created,
                "revision_id": event_revision_id(db, s["user_id"], eid),
            }

    def owned_rule(db, rule_id, version, s):
        row = db.execute(
            "SELECT * FROM rules WHERE rule_id=? AND version=?", (rule_id, version)
        ).fetchone()
        if not row or (s["tenant"] and row["tenant"] != s["tenant"]):
            raise HTTPException(404, "Rule not found")
        if row["layer"] != "university":
            raise HTTPException(403, "Protected legal layer")
        return row

    @app.get("/api/admin/rules", response_model=RulesResponse, tags=["University"])
    def list_rules(s=Depends(editor)):
        with database.transaction() as db:
            rows = db.execute(
                "SELECT * FROM rules WHERE layer='university' AND (? IS NULL OR tenant=?) ORDER BY rule_id,version DESC",
                (s["tenant"], s["tenant"]),
            )
            return {
                "rules": [
                    {**json.loads(r["body"]), "status": r["status"]} for r in rows
                ],
                "tenant": s["tenant"],
                "role": s["role"],
                "demo_model": True,
            }

    @app.post("/api/admin/rules", status_code=201, tags=["University"])
    def create_rule(body: RuleDraft, tenant: str | None = None, s=Depends(editor)):
        target = s["tenant"] or tenant
        if target not in ("sutd", "leti"):
            raise HTTPException(422, "A supported tenant is required")
        if s["role"] == "university_editor" and body.source_type != "demo_model":
            raise HTTPException(403, "Model editor must label evidence demo_model")
        errors = validate_rule(body)
        if errors:
            raise HTTPException(422, errors)
        with database.transaction() as db:
            existing = db.execute(
                "SELECT * FROM rules WHERE rule_id=?", (body.rule_id,)
            ).fetchall()
            if any(
                r["tenant"] != target or r["layer"] != "university" for r in existing
            ):
                raise HTTPException(
                    403, "Rule id belongs to another tenant or protected layer"
                )
            if s["role"] == "university_editor" and any(
                json.loads(r["body"])["source_type"] != "demo_model" for r in existing
            ):
                raise HTTPException(
                    403,
                    "Create a separate model rule; do not replace the public instruction",
                )
            if body.semantic_action_key in (
                "M01",
                "M02",
                "M03",
                "M04",
                "M07",
                "M08",
                "M09",
            ):
                raise HTTPException(
                    422,
                    "Use a unique action key; existing actions are protected from semantic duplication",
                )
            if any(
                json.loads(r["body"])["semantic_action_key"] == body.semantic_action_key
                for r in db.execute(
                    "SELECT body FROM rules WHERE tenant=? AND rule_id!=?",
                    (target, body.rule_id),
                )
            ):
                raise HTTPException(
                    422, "This action is already described by another rule"
                )
            version = max([r["version"] for r in existing], default=0) + 1
            record = draft_body(body, target, version)
            record["created_by"] = s["user_id"]
            db.execute(
                "INSERT INTO rules VALUES(?,?,?,?,?,?,?,NULL)",
                (
                    body.rule_id,
                    version,
                    target,
                    "university",
                    "draft",
                    dumps(record),
                    s["user_id"],
                ),
            )
            return record

    @app.patch("/api/admin/rules/{rule_id}/versions/{version}", tags=["University"])
    def edit_draft(rule_id: str, version: int, body: RuleDraft, s=Depends(editor)):
        with database.transaction() as db:
            row = owned_rule(db, rule_id, version, s)
            if row["status"] not in ("draft", "validated"):
                raise HTTPException(
                    409, "Published versions are immutable; create a new version"
                )
            if body.rule_id != rule_id:
                raise HTTPException(422, "Rule id cannot change")
            if s["role"] == "university_editor" and body.source_type != "demo_model":
                raise HTTPException(403, "Model evidence label required")
            errors = validate_rule(body)
            if errors:
                raise HTTPException(422, errors)
            record = draft_body(body, row["tenant"], version)
            if body.semantic_action_key in (
                "M01",
                "M02",
                "M03",
                "M04",
                "M07",
                "M08",
                "M09",
            ) or any(
                json.loads(r["body"])["semantic_action_key"] == body.semantic_action_key
                for r in db.execute(
                    "SELECT body FROM rules WHERE tenant=? AND rule_id!=?",
                    (row["tenant"], rule_id),
                )
            ):
                raise HTTPException(422, "Use a unique semantic action key")
            record["created_by"] = s["user_id"]
            db.execute(
                "UPDATE rules SET body=?,status='draft' WHERE rule_id=? AND version=?",
                (dumps(record), rule_id, version),
            )
            return record

    @app.post(
        "/api/admin/rules/{rule_id}/versions/{version}/validate", tags=["University"]
    )
    def validate_draft(rule_id: str, version: int, s=Depends(editor)):
        with database.transaction() as db:
            row = owned_rule(db, rule_id, version, s)
            if row["status"] not in ("draft", "validated"):
                raise HTTPException(409, "Only drafts can be validated")
            record = json.loads(row["body"])
            fields = {k: v for k, v in record.items() if k in RuleDraft.model_fields}
            errors = validate_rule(RuleDraft.model_validate(fields))
            if errors:
                raise HTTPException(422, errors)
            samples = simulate_rule(record)
            db.execute(
                "UPDATE rules SET status='validated' WHERE rule_id=? AND version=?",
                (rule_id, version),
            )
            return {
                "validated": True,
                "meaning": "Structural validation; not legal certification",
                "simulations": samples,
            }

    @app.post(
        "/api/admin/rules/{rule_id}/versions/{version}/preview",
        response_model=PreviewResponse,
        tags=["University"],
    )
    def preview(rule_id: str, version: int, s=Depends(editor)):
        with database.transaction() as db:
            row = owned_rule(db, rule_id, version, s)
            if row["status"] != "validated":
                raise HTTPException(409, "Validate before preview")
            # Return task diff, not students' profile/citizenship/MAX identity.
            return preview_publication(db, json.loads(row["body"]))

    @app.post(
        "/api/admin/rules/{rule_id}/versions/{version}/publish", tags=["University"]
    )
    def publish(
        rule_id: str, version: int, body: PublicationRequest, s=Depends(editor)
    ):
        with database.transaction() as db:
            row = owned_rule(db, rule_id, version, s)
            key = f"{s['user_id']}:{body.idempotency_key}"
            previous = db.execute(
                "SELECT * FROM publications WHERE idempotency_key=?", (key,)
            ).fetchone()
            if previous:
                if previous["rule_id"] != rule_id or previous["version"] != version:
                    raise HTTPException(409, "Idempotency key already used")
                return {**dict(previous), "body": json.loads(previous["body"])}
            if row["status"] != "validated":
                raise HTTPException(409, "Only validated rules can be published")
            record = json.loads(row["body"])
            check = preview_publication(db, record)
            if check["preview_token"] != body.preview_token:
                raise HTTPException(
                    409, "Preview changed; review it again before publishing"
                )
            record["status"] = "published"
            published = stamp()
            db.execute(
                "UPDATE rules SET status='published',body=?,published_at=? WHERE rule_id=? AND version=?",
                (dumps(record), published, rule_id, version),
            )
            if record["effective_from"] <= moscow_today().isoformat():
                db.execute(
                    "UPDATE rules SET status='archived' WHERE rule_id=? AND version<? AND status='published'",
                    (rule_id, version),
                )
            publication_id = uid()
            for affected in check["affected"]:
                recalculate(
                    db, affected["user_id"], "university_rule_published", publication_id
                )
            audit = {
                "preview_token": check["preview_token"],
                "change_label": record["source_type"],
                "confirmation": True,
                "author": s["user_id"],
                "affected_user_ids": [a["user_id"] for a in check["affected"]],
            }
            db.execute(
                "INSERT INTO publications VALUES(?,?,?,?,?,?,?,?,?)",
                (
                    publication_id,
                    rule_id,
                    version,
                    row["tenant"],
                    s["user_id"],
                    published,
                    check["affected_count"],
                    dumps(audit),
                    key,
                ),
            )
            return {
                "publication_id": publication_id,
                "affected_count": check["affected_count"],
                "change_label": record["source_type"],
            }

    @app.post(
        "/api/admin/rules/{rule_id}/versions/{version}/archive", tags=["University"]
    )
    def archive(rule_id: str, version: int, s=Depends(editor)):
        with database.transaction() as db:
            row = owned_rule(db, rule_id, version, s)
            if (
                json.loads(row["body"])["source_type"] != "demo_model"
                and s["role"] != "maintainer"
            ):
                raise HTTPException(
                    403, "A model editor cannot archive public instructions"
                )
            db.execute(
                "UPDATE rules SET status='archived' WHERE rule_id=? AND version=?",
                (rule_id, version),
            )
            publication_id = uid()
            for user in db.execute("SELECT id,profile FROM users").fetchall():
                if json.loads(user["profile"]).get("university_id") == row["tenant"]:
                    recalculate(
                        db, user["id"], "university_rule_archived", publication_id
                    )
            return {"archived": True}

    @app.get("/api/admin/publications", tags=["University"])
    def publications(s=Depends(editor)):
        with database.transaction() as db:
            return {
                "publications": [
                    {**dict(r), "body": json.loads(r["body"])}
                    for r in db.execute(
                        "SELECT * FROM publications WHERE (? IS NULL OR tenant=?) ORDER BY created_at DESC LIMIT 100",
                        (s["tenant"], s["tenant"]),
                    )
                ]
            }

    @app.get("/api/admin/notifications", tags=["University"])
    def notifications(s=Depends(editor)):
        with database.transaction() as db:
            result = []
            for row in db.execute(
                "SELECT o.*,u.profile FROM outbox o JOIN users u ON u.id=o.user_id ORDER BY o.rowid DESC LIMIT 200"
            ):
                if (
                    not s["tenant"]
                    or json.loads(row["profile"]).get("university_id") == s["tenant"]
                ):
                    result.append(
                        {
                            k: row[k]
                            for k in (
                                "id",
                                "status",
                                "attempts",
                                "last_error",
                                "sent_at",
                            )
                        }
                    )
            return {"notifications": result}

    @app.post("/api/max/webhook", tags=["MAX"])
    async def webhook(request: Request):
        if (
            settings.bot_transport != "webhook"
            or not settings.max_webhook_secret
            or not hmac.compare_digest(
                request.headers.get("X-Max-Bot-Api-Secret", ""),
                settings.max_webhook_secret,
            )
        ):
            raise HTTPException(403, "Invalid webhook secret or disabled transport")
        raw = await request.body()
        if len(raw) > 100000:
            raise HTTPException(413, "Update too large")
        try:
            update = json.loads(raw)
            if not isinstance(update, dict):
                raise ValueError()
        except ValueError:
            raise HTTPException(400, "Invalid update") from None
        with database.transaction() as db:
            accept_update(db, update)
        return {"ok": True}

    @app.get("/", include_in_schema=False)
    def index():
        return FileResponse(ROOT / "app/static/index.html")

    @app.get("/admin", include_in_schema=False)
    def admin_page():
        return FileResponse(ROOT / "app/static/admin.html")

    app.mount("/static", StaticFiles(directory=ROOT / "app/static"), name="static")
    return app


app = create_app()

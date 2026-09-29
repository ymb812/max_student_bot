import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path


def dumps(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


class Database:
    def __init__(self, path):
        self.path = path
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.transaction() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, max_user_id INTEGER UNIQUE,
                profile TEXT NOT NULL, updated_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT,
                role TEXT NOT NULL, tenant TEXT, expires_at INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
                type TEXT NOT NULL, occurred_at TEXT NOT NULL, recorded_at TEXT NOT NULL,
                payload TEXT NOT NULL, idempotency_key TEXT NOT NULL, supersedes_event_id TEXT,
                retracted_at TEXT, UNIQUE(user_id,idempotency_key));
            CREATE TABLE IF NOT EXISTS rules(rule_id TEXT NOT NULL, version INTEGER NOT NULL,
                tenant TEXT, layer TEXT NOT NULL, status TEXT NOT NULL, body TEXT NOT NULL,
                created_by TEXT NOT NULL, published_at TEXT, PRIMARY KEY(rule_id,version));
            CREATE TABLE IF NOT EXISTS tasks(task_key TEXT PRIMARY KEY, user_id TEXT NOT NULL,
                body TEXT NOT NULL, user_status TEXT NOT NULL, completed_at TEXT);
            CREATE TABLE IF NOT EXISTS revisions(id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
                reason TEXT NOT NULL, trigger_id TEXT, created_at TEXT NOT NULL, changes TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS publications(id TEXT PRIMARY KEY, rule_id TEXT NOT NULL,
                version INTEGER NOT NULL, tenant TEXT NOT NULL, author TEXT NOT NULL,
                created_at TEXT NOT NULL, affected_count INTEGER NOT NULL, body TEXT NOT NULL,
                idempotency_key TEXT UNIQUE NOT NULL);
            CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
                dedupe_key TEXT UNIQUE NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
                last_error TEXT, sent_at TEXT);
            CREATE TABLE IF NOT EXISTS inbox(id TEXT PRIMARY KEY, body TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending');
            CREATE TABLE IF NOT EXISTS candidates(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,
                body TEXT NOT NULL,expires_at INTEGER NOT NULL,confirmed_event_id TEXT);
            CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS events_user ON events(user_id);
            CREATE INDEX IF NOT EXISTS tasks_user ON tasks(user_id);
            CREATE INDEX IF NOT EXISTS revisions_user ON revisions(user_id);
            CREATE INDEX IF NOT EXISTS outbox_pending ON outbox(status,next_attempt_at);
            """)

    @contextmanager
    def transaction(self):
        conn = sqlite3.connect(self.path, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("BEGIN IMMEDIATE")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

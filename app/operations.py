"""Private consistent SQLite snapshots. No live restore or destructive overwrite."""

import argparse
import os
import sqlite3
from contextlib import closing
from pathlib import Path

REQUIRED_TABLES = {
    "users",
    "sessions",
    "events",
    "rules",
    "tasks",
    "revisions",
    "publications",
    "outbox",
    "inbox",
    "candidates",
    "metadata",
}


def verify_snapshot(path):
    path = Path(path).resolve(strict=True)
    with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as db:
        if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("Snapshot failed SQLite integrity check")
        tables = {
            r[0]
            for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        if not REQUIRED_TABLES <= tables:
            raise ValueError("Snapshot does not contain the application schema")
        return {
            name: db.execute("SELECT COUNT(*) FROM " + name).fetchone()[0]
            for name in sorted(REQUIRED_TABLES)
        }


def backup_database(source, target):
    source = Path(source).resolve(strict=True)
    root = source.parent / "backups"
    target = Path(target).absolute()
    if (
        root.is_symlink()
        or target.is_symlink()
        or not target.resolve().is_relative_to(root.resolve())
    ):
        raise ValueError(
            "Backup target must stay inside the configured database backups directory"
        )
    if target.suffix != ".sqlite3":
        raise ValueError("Use a .sqlite3 snapshot filename")
    target.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation protects existing snapshots even if two operators race.
    fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    try:
        with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as db:
            with closing(sqlite3.connect(target)) as destination:
                db.backup(destination, pages=128)
        counts = verify_snapshot(target)
    except Exception:
        target.unlink()
        raise
    return {"path": str(target), "integrity": "ok", "tables": counts}


def main():
    from app.config import Settings

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["backup", "verify"])
    parser.add_argument(
        "path", help="Private snapshot path. backup never overwrites a file."
    )
    args = parser.parse_args()
    if args.operation == "backup":
        result = backup_database(Settings().database_path, args.path)
    else:
        result = {"integrity": "ok", "tables": verify_snapshot(args.path)}
    import json

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()

"""Build a curated context pack for a colleague, without credentials or user data."""

import argparse
import hashlib
import json
import re
import shutil
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
FILES = (
    "CHATGPT_CONTEXT_README.md",
    "PROJECT_CONTEXT.md",
    "max_foreign_students_developer_handoff_MASTER_FINAL_2026_09_27.md",
    "foreign_students_rules_research_spbgutd_leti_2026.md",
    "CODE_MAP.md",
    "IMPLEMENTATION_STATUS.md",
    "MAX_ACCEPTANCE_2026_09_28.md",
    "DEMO_PROFILES.md",
    "UI_REDESIGN_2026_09_28.md",
    "PRESENTATION_CONTENT.md",
    "SUBMISSION_CHECKLIST.md",
    "Забота о людях.pdf",
    "Общий FAQ.pdf",
)


def local_secrets():
    values = [
        value
        for name, value in dotenv_values(ROOT / ".env").items()
        if value and any(label in name.upper() for label in ("TOKEN", "KEY", "SECRET", "PASSWORD"))
    ]
    credentials = ROOT / ".local/server.json"
    if credentials.exists():
        values.append(json.loads(credentials.read_text(encoding="utf-8-sig"))["password"])
    instructions = ROOT / "AGENTS.md"
    if instructions.exists():
        values.extend(re.findall(r"(?:Токен|MAX_BOT_TOKEN)\s*[:=]\s*([^\s]+)", instructions.read_text(encoding="utf-8-sig")))
    return [value.encode("utf-8") for value in values if len(value) >= 8]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", default=datetime.now(timezone(timedelta(hours=3))).date().isoformat())
    args = parser.parse_args()
    datetime.strptime(args.date, "%Y-%m-%d")
    name = "marketkit_chatgpt_context_" + args.date
    output = ROOT / "output/handoff"
    folder = output / name
    if folder.is_symlink() or output.is_symlink():
        raise SystemExit("Refusing symlink output")
    if not folder.resolve().is_relative_to(ROOT.resolve()):
        raise SystemExit("Output must stay inside the workspace")
    if folder.exists() and any(path.name not in FILES or not path.is_file() or path.is_symlink() for path in folder.iterdir()):
        raise SystemExit("Unexpected files in existing context folder")

    secrets = local_secrets()
    manifest = []
    for filename in FILES:
        source = ROOT / "docs" / filename
        if not source.is_file() or source.is_symlink():
            raise SystemExit("Missing or unsafe source: " + filename)
        body = source.read_bytes()
        if any(value in body for value in secrets) or b"-----BEGIN PRIVATE KEY-----" in body:
            raise SystemExit("Refusing sensitive source: " + filename)
        if source.suffix == ".md":
            body.decode("utf-8")
        elif not body.startswith(b"%PDF-"):
            raise SystemExit("Invalid PDF source: " + filename)
        manifest.append({"name": filename, "size": len(body), "sha256": hashlib.sha256(body).hexdigest()})

    folder.mkdir(parents=True, exist_ok=True)
    for filename in FILES:
        shutil.copy2(ROOT / "docs" / filename, folder / filename)
    archive = output / (name + ".zip")
    if archive.is_symlink():
        raise SystemExit("Refusing archive symlink")
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for filename in FILES:
            bundle.write(folder / filename, filename)
    with zipfile.ZipFile(archive) as bundle:
        if bundle.testzip() or bundle.namelist() != list(FILES):
            raise SystemExit("Archive integrity check failed")
        for record in manifest:
            if hashlib.sha256(bundle.read(record["name"])).hexdigest() != record["sha256"]:
                raise SystemExit("Packaged file mismatch")

    receipt = {"date": args.date, "archive": archive.name, "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(), "files": manifest}
    (ROOT / ".local").mkdir(exist_ok=True)
    (ROOT / ".local/context-handoff-manifest.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Context pack:", archive.relative_to(ROOT))
    print("11 Markdown documents, 2 official PDFs; contents and archive verified.")
    print("Credentials and student database excluded; local secret scan passed.")


if __name__ == "__main__":
    main()

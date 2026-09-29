"""Create a reviewable source snapshot without local secrets or student data."""

import hashlib
import argparse
import json
import re
import zipfile
from datetime import datetime
from pathlib import Path

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
out = ROOT / ".local" / "release"
out.mkdir(parents=True, exist_ok=True)
files = []
for folder in ("app", "scripts", "tests", "docs", "deploy"):
    files.extend(
        p
        for p in (ROOT / folder).rglob("*")
        if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc"
    )
files.extend(
    ROOT / n
    for n in (
        "README.md",
        "Dockerfile",
        "docker-compose.yml",
        "deploy.sh",
        "requirements.txt",
        "requirements-dev.txt",
        ".dockerignore",
        ".gitignore",
        ".env.example",
        "openapi.json",
        "DATA-API.yaml",
    )
)
secrets = [
    v.encode()
    for k, v in dotenv_values(ROOT / ".env").items()
    if v and any(part in k.upper() for part in ("TOKEN", "KEY", "SECRET", "PASSWORD"))
]
credentials = ROOT / ".local" / "server.json"
if credentials.exists():
    secrets.append(
        json.loads(credentials.read_text(encoding="utf-8-sig"))["password"].encode()
    )
for path in files:
    if path.is_symlink() or any(
        secret in path.read_bytes() for secret in secrets if len(secret) >= 8
    ):
        raise SystemExit(f"Refusing to package unsafe file: {path.relative_to(ROOT)}")
name = "max_students_mvp_" + datetime.now().astimezone().strftime("%Y-%m-%d") + ".zip"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--label", default="", help="Optional distinct snapshot suffix")
args = parser.parse_args()
if args.label:
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,39}", args.label):
        raise SystemExit("Snapshot label must contain lowercase letters, digits or hyphens")
    name = name.removesuffix(".zip") + "_" + args.label + ".zip"
archive = out / name
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
    for path in sorted(files):
        bundle.write(path, path.relative_to(ROOT).as_posix())
checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix(".zip.sha256").write_text(
    checksum + "  " + name + "\n", encoding="utf-8"
)
print("Source snapshot:", archive)
print("SHA256:", checksum)
print("Files:", len(files))

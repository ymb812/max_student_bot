"""Initialise an ignored local env. Never print generated secrets."""

import re
import secrets
from pathlib import Path

text = (
    Path(".env").read_text(encoding="utf-8-sig")
    if Path(".env").exists()
    else Path(".env.example").read_text(encoding="utf-8-sig")
)
instructions = Path("AGENTS.md").read_text(encoding="utf-8")
token = re.search(r"Токен:\s*([^\s]+)", instructions)
values = {"DEMO_MODE": "true", "MAX_BOT_TOKEN": token.group(1) if token else ""}
for name in (
    "EDITOR_SUTD_KEY",
    "EDITOR_LETI_KEY",
    "MAINTAINER_KEY",
    "MAX_WEBHOOK_SECRET",
):
    values[name] = secrets.token_urlsafe(32)
for name, value in values.items():
    match = re.search(r"^" + name + r"=(.*)$", text, flags=re.M)
    if not match:
        text += "\n" + name + "=" + value
    elif not match.group(1).strip() or name == "DEMO_MODE":
        text = re.sub(
            r"^" + name + r"=.*$", lambda _: name + "=" + value, text, flags=re.M
        )
Path(".env").write_text(text, encoding="utf-8")
print("Local configuration is ready in ignored .env")

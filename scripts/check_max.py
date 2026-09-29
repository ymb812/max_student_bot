"""Read-only MAX identity and subscriptions check; outputs no secrets."""

import asyncio
import re
from pathlib import Path
from app.config import Settings
from app.max_client import MaxClient


async def main():
    client = MaxClient(Settings())
    me = await client.request("GET", "/me")
    username = me.get("username")
    print(
        {"username": username, "bot_id": me.get("user_id"), "is_bot": me.get("is_bot")}
    )
    subs = await client.request("GET", "/subscriptions")
    print("Existing webhook subscriptions:", len(subs.get("subscriptions", [])))
    if username and Path(".env").exists():
        env = Path(".env")
        env.write_text(
            re.sub(
                r"^MAX_BOT_USERNAME=.*$",
                lambda _: "MAX_BOT_USERNAME=" + username,
                env.read_text(encoding="utf-8-sig"),
                flags=re.M,
            ),
            encoding="utf-8",
        )


asyncio.run(main())

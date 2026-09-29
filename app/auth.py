import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl
from fastapi import HTTPException


def validate_launch_data(raw, bot_token, now=None):
    now = int(time.time()) if now is None else now
    try:
        pairs = parse_qsl(raw, keep_blank_values=True, strict_parsing=True)
        if len({k for k, _ in pairs}) != len(pairs):
            raise ValueError("duplicate key")
        values = dict(pairs)
        signature = values.pop("hash")
        auth_date = int(values["auth_date"])
        if not bot_token or not 0 <= now - auth_date <= 3600:
            raise ValueError("expired")
        secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
        check = "\n".join(f"{k}={v}" for k, v in sorted(values.items()))
        digest = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(digest, signature):
            raise ValueError("signature")
        user = json.loads(values["user"])
        if (
            isinstance(user["id"], bool)
            or not isinstance(user["id"], int)
            or user["id"] <= 0
        ):
            raise ValueError("user")
        return user["id"]
    except (KeyError, ValueError, TypeError):
        raise HTTPException(401, "Invalid or expired MAX launch data") from None

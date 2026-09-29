"""Export the actual OpenAPI schema. Run from the repository root."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import app

schema = app.openapi()
if len(sys.argv) > 1:
    schema["servers"] = [{"url": sys.argv[1].rstrip("/")}]
Path("openapi.json").write_text(
    json.dumps(schema, ensure_ascii=False, indent=2), encoding="utf-8"
)
print("Exported openapi.json:", len(schema["paths"]), "paths")

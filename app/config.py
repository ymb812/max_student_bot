from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_path: str = "data/max_students.sqlite3"
    public_base_url: str = "http://localhost:8000"
    demo_mode: bool = False
    max_bot_token: str = ""
    max_bot_username: str = ""
    max_api_url: str = "https://platform-api2.max.ru"
    max_webhook_secret: str = ""
    bot_transport: str = "disabled"
    editor_sutd_key: str = ""
    editor_leti_key: str = ""
    maintainer_key: str = ""
    session_ttl_seconds: int = 86400
    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = ""
    retention_days: int = 180


ROOT = Path(__file__).resolve().parent.parent

"""Application configuration loaded from environment variables."""
import os
from functools import lru_cache
from pydantic_settings import BaseSettings

# Absolute path to the backend directory (parent of this `app` package), so the
# default SQLite database lives in a fixed location regardless of the working
# directory the server is launched from.
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DEFAULT_DB = "sqlite:///" + os.path.join(_BACKEND_DIR, "creatorhub.db").replace("\\", "/")

# Sentinel for the insecure dev secret — production must override SECRET_KEY.
DEFAULT_SECRET = "dev-creatorhub-secret-change-me"


class Settings(BaseSettings):
    # Database — defaults to SQLite so the app runs with zero setup.
    # In Docker Compose this is overridden to point at Postgres.
    database_url: str = _DEFAULT_DB

    # CORS — comma separated list of allowed origins
    cors_origins: str = "*"

    # File upload guard rails
    max_upload_mb: int = 10
    allowed_extensions: str = ".csv,.xlsx,.xls"

    app_name: str = "Creator Hub API"
    app_version: str = "1.1.0"

    # "development" | "production" — production enforces a real SECRET_KEY.
    environment: str = "development"

    # Auth — override SECRET_KEY in production via env.
    secret_key: str = DEFAULT_SECRET
    token_ttl_hours: int = 24 * 7   # login session length

    # Google Sign-In — OAuth 2.0 Web client ID (from Google Cloud console).
    # When set, the frontend shows the "Sign in with Google" button and the
    # backend verifies ID tokens against this audience. Empty = feature off.
    google_client_id: str = ""
    # Email domains that are auto-granted admin on Google login (substring match).
    admin_email_domains: str = "wkwkp"

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() in {"production", "prod"}

    @property
    def using_default_secret(self) -> bool:
        return self.secret_key == DEFAULT_SECRET

    class Config:
        env_file = ".env"
        extra = "ignore"

    @property
    def origins(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def extensions(self) -> set[str]:
        return {e.strip().lower() for e in self.allowed_extensions.split(",")}


@lru_cache
def get_settings() -> Settings:
    return Settings()

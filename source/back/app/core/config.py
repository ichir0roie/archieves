from functools import lru_cache
from typing import Literal
from urllib.parse import quote_plus

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    PROJECT_NAME: str = "archieves-api"
    API_V1_STR: str = "/api/v1"
    ENV: str = "local"

    # Individual connection parts, so switching targets (e.g. a local DB) only
    # means overriding DB_HOST/DB_PORT instead of retyping the whole DSN.
    DB_DRIVER: str = "postgresql+psycopg2"
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_USER: str = "postgres"
    DB_PASSWORD: str = "postgres"
    DB_NAME: str = "archieves"

    # Full SQLAlchemy connection string. Leave unset to have it built from the
    # DB_* parts above; set it directly to override everything at once (e.g.
    # a full RDS Proxy or SQLite URL that doesn't fit the host/port shape).
    DATABASE_URL: str = ""

    @model_validator(mode="after")
    def _default_database_url(self) -> "Settings":
        if not self.DATABASE_URL:
            self.DATABASE_URL = (
                f"{self.DB_DRIVER}://{self.DB_USER}:{quote_plus(self.DB_PASSWORD)}"
                f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
            )
        return self

    BACKEND_CORS_ORIGINS: list[str] = ["*"]

    # Cognito user pool backing authentication. Endpoints that depend on
    # app.core.security.get_current_user verify the bearer token against
    # this pool's JWKS, matching all_diary_backend's auth approach.
    AWS_REGION: str = "ap-northeast-1"
    USERPOOL_ID: str = ""
    APP_CLIENT_ID: str = ""

    # Lambda execution environments can stay warm and reuse the SQLAlchemy
    # engine across invocations, but the pool must stay small since each
    # concurrent Lambda instance holds its own connections. Consider an RDS
    # Proxy in front of PostgreSQL if concurrency grows.
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 0
    DB_POOL_PRE_PING: bool = True


class DebugSettings(BaseSettings):
    """Local-dev/test-only knobs, kept out of Settings so production config
    can't accidentally depend on them."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # "cognito" verifies bearer tokens against the user pool (default,
    # matches production). "mock" skips Cognito/JWKS entirely and makes
    # get_current_user return MOCK_USER_* below, so the API can be run and
    # debugged locally (e.g. alongside the archieves frontend) without any
    # AWS credentials or a provisioned user pool.
    AUTH_MODE: Literal["cognito", "mock"] = "cognito"
    MOCK_USER_SUB: str = "local-dev-user"
    MOCK_USER_USERNAME: str = "local-dev-user"
    MOCK_USER_EMAIL: str = "dev@example.com"

    # How mods.factory_db's factory_boy factories persist created objects:
    # "flush" pushes rows to the DB within the current transaction (visible to
    # queries, rolled back by the test harness), "commit" durably commits each
    # created object.
    FACTORY_SESSION_PERSISTENCE: Literal["flush", "commit"] = "flush"


@lru_cache
def get_settings() -> Settings:
    return Settings()


@lru_cache
def get_debug_settings() -> DebugSettings:
    return DebugSettings()


settings = get_settings()
debug_settings = get_debug_settings()

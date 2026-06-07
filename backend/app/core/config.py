"""Application settings, loaded from environment / .env via pydantic-settings."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- LLM providers ---
    llm_provider: str = "openai"
    llm_model: str = "gpt-5-mini"
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    openai_base_url: str | None = None
    anthropic_base_url: str | None = None

    # --- Database ---
    database_url: str = "postgresql+asyncpg://another_me:another_me@localhost:5432/another_me"

    # --- Auth / JWT ---
    jwt_secret: str = "dev-insecure-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080  # 7 days

    # --- Orchestration limits ---
    max_rounds: int = 8
    max_concurrent_conversations: int = 4

    # --- Trips (autonomous "travelling-frog" journeys, §6) ---
    # Canonical default wall-clock duration (seconds) a trip is spread over
    # (env: TRIP_DURATION_SECONDS). Demo runs fast (~45s); set it to hours for a
    # slower, "travelling-frog"-style world. Trip creation uses this as the default
    # when the request omits ``duration_seconds``.
    trip_duration_seconds: int = 45
    # Deprecated v1 alias of ``trip_duration_seconds`` (env: TRIP_DURATION). Kept so
    # any older config / code that reads it keeps working; new code should prefer
    # ``trip_duration_seconds``.
    trip_duration: int = 60
    # Default number of encounters per trip (clamped to 2..4 by the planner).
    trip_max_encounters: int = 3

    # --- Sandbox runner ---
    sandbox_url: str = "http://localhost:8001"
    sandbox_timeout_seconds: int = 10

    # --- CORS ---
    cors_origins: str = "*"

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse ``cors_origins`` into a list. ``"*"`` → ``["*"]``."""
        raw = self.cors_origins.strip()
        if raw == "*":
            return ["*"]
        return [origin.strip() for origin in raw.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return the cached application settings singleton."""
    return Settings()

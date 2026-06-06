"""Another Me API — FastAPI application entrypoint."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(title="Another Me API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["health"])
async def health() -> dict:
    """Liveness probe used by container healthchecks (no ``/api`` prefix)."""
    return {
        "status": "ok",
        "service": "backend",
        "time": datetime.now(timezone.utc).isoformat(),
    }


app.include_router(api_router)

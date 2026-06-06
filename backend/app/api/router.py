"""Aggregated ``/api`` router."""

from __future__ import annotations

from fastapi import APIRouter

from app.api import (
    agents,
    auth,
    conversations,
    dispatches,
    evolutions,
    marketplace,
    reports,
    scenarios,
)

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)
api_router.include_router(agents.router)
api_router.include_router(scenarios.router)
api_router.include_router(dispatches.router)
api_router.include_router(conversations.router)
api_router.include_router(reports.router)
api_router.include_router(evolutions.router)
api_router.include_router(marketplace.router)

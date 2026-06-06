"""Async SQLAlchemy engine, session factory, and FastAPI session dependency."""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.models.base import Base

settings = get_settings()

# ``pool_pre_ping`` guards against stale connections after the DB restarts.
engine = create_async_engine(settings.database_url, pool_pre_ping=True)

async_session_maker = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding an ``AsyncSession`` scoped to the request."""
    async with async_session_maker() as session:
        yield session


__all__ = ["Base", "engine", "async_session_maker", "get_session"]

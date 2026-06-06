"""Shared FastAPI dependencies: DB session + auth."""

from __future__ import annotations

import uuid
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import decode_token
from app.models import User

# auto_error=False so we can return a 401 (not 403) with our own detail.
bearer_scheme = HTTPBearer(auto_error=False)


async def _user_from_credentials(
    credentials: HTTPAuthorizationCredentials | None,
    session: AsyncSession,
) -> User | None:
    if credentials is None:
        return None
    try:
        payload = decode_token(credentials.credentials)
    except jwt.PyJWTError:
        return None
    sub = payload.get("sub")
    if not sub:
        return None
    try:
        user_id = uuid.UUID(str(sub))
    except (ValueError, TypeError):
        return None
    return await session.get(User, user_id)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    """Require a valid Bearer token and return the matching user (else 401)."""
    user = await _user_from_credentials(credentials, session)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def get_optional_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User | None:
    """Return the authenticated user if a valid token is present, else ``None``.

    Used for public-but-personalized routes (e.g. listing agents with ``owner=me``).
    """
    return await _user_from_credentials(credentials, session)


SessionDep = Annotated[AsyncSession, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]

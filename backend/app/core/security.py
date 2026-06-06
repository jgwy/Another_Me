"""Password hashing (argon2 via pwdlib) and JWT helpers (PyJWT, HS256)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from pwdlib import PasswordHash

from app.core.config import get_settings

_password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    """Hash a plaintext password (argon2)."""
    return _password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    """Verify a plaintext password against a stored hash."""
    return _password_hash.verify(password, hashed)


def create_access_token(sub: str) -> str:
    """Create a signed HS256 JWT with ``sub`` / ``iat`` / ``exp`` claims."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.access_token_expire_minutes)
    payload: dict[str, Any] = {
        "sub": sub,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT. Raises ``jwt.PyJWTError`` on invalid/expired tokens."""
    settings = get_settings()
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])

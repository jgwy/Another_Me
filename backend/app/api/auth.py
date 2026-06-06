"""Auth endpoints — fully implemented in the foundation."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import or_, select

from app.api.deps import CurrentUser, SessionDep
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User
from app.schemas import AuthResponse, LoginRequest, RegisterRequest
from app.schemas import User as UserSchema

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, session: SessionDep) -> AuthResponse:
    existing = await session.scalar(
        select(User).where(or_(User.email == body.email, User.username == body.username))
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="email or username already taken",
        )
    user = User(
        email=body.email,
        username=body.username,
        password_hash=hash_password(body.password),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    token = create_access_token(str(user.id))
    return AuthResponse(access_token=token, user=UserSchema.model_validate(user))


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, session: SessionDep) -> AuthResponse:
    user = await session.scalar(select(User).where(User.email == body.email))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid credentials",
        )
    token = create_access_token(str(user.id))
    return AuthResponse(access_token=token, user=UserSchema.model_validate(user))


@router.get("/me", response_model=UserSchema)
async def me(current_user: CurrentUser) -> User:
    return current_user

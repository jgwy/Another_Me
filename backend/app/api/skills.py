"""Standalone Skill endpoints (v2).

Skills created here are library skills (``agent_id == null``) unless attached to
an agent. ``prompt_body`` is the canonical capability text; ``content`` is kept
mirrored for v1 back-compat.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import String, cast, func, or_, select

from app.api.deps import CurrentUser, OptionalUser, SessionDep
from app.models import Agent, Skill
from app.schemas import Page, SkillCreate, SkillPatch
from app.schemas import Skill as SkillSchema
from app.services.skillpack import SkillPackError, parse_skill_pack

router = APIRouter(prefix="/skills", tags=["skills"])

# Reject obviously-too-large uploads before buffering the whole archive.
_MAX_UPLOAD_BYTES = 32 * 1024 * 1024


@router.post("", response_model=SkillSchema, status_code=status.HTTP_201_CREATED)
async def create_skill(body: SkillCreate, current_user: CurrentUser, session: SessionDep) -> Skill:
    if body.agent_id is not None:
        agent = await session.get(Agent, body.agent_id)
        if agent is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="agent not found")
        if agent.owner_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="not the owner of agent_id"
            )

    # prompt_body is canonical; content mirrors it for v1 back-compat.
    body_text = body.prompt_body or body.content
    skill = Skill(
        agent_id=body.agent_id,
        owner_id=current_user.id,
        name=body.name,
        description=body.description,
        prompt_body=body_text,
        content=body_text,
        params=[p.model_dump() for p in body.params],
        tags=list(body.tags),
        executable=body.executable.model_dump() if body.executable is not None else None,
        is_public=body.is_public,
        source=body.source or "upload",
    )
    session.add(skill)
    await session.commit()
    await session.refresh(skill)
    return skill


@router.post("/import", response_model=SkillSchema, status_code=status.HTTP_201_CREATED)
async def import_skill(
    current_user: CurrentUser,
    session: SessionDep,
    file: UploadFile = File(..., description=".zip pack that contains a SKILL.md at its root"),
    is_public: bool = Form(False),
    agent_id: uuid.UUID | None = Form(None),
) -> Skill:
    """Import a skill from a ``.zip`` pack (multipart/form-data).

    Unzip → require ``SKILL.md`` → parse frontmatter into ``manifest`` + body into
    ``skill_md`` / ``prompt_body`` → record packaged files in ``resources`` →
    persist as a library Skill (``source="upload"``). When ``agent_id`` is given the
    skill is attached to that (owned) agent. Returns the created **Skill** (201);
    **422** if the archive is invalid or has no ``SKILL.md``.
    """
    # If attaching to an agent, enforce ownership (mirrors create_skill).
    if agent_id is not None:
        agent = await session.get(Agent, agent_id)
        if agent is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="agent not found")
        if agent.owner_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="not the owner of agent_id"
            )

    data = await file.read()
    if not data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="empty upload"
        )
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="uploaded .zip is too large"
        )

    fallback = (file.filename or "Imported Skill").rsplit("/", 1)[-1]
    if fallback.lower().endswith(".zip"):
        fallback = fallback[:-4]

    try:
        pack = parse_skill_pack(data, fallback_name=fallback or "Imported Skill")
    except SkillPackError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    skill = Skill(
        agent_id=agent_id,
        owner_id=current_user.id,
        name=pack.name,
        description=pack.description,
        # prompt_body is canonical; content mirrors it for v1 back-compat.
        prompt_body=pack.prompt_body,
        content=pack.prompt_body,
        skill_md=pack.skill_md,
        manifest=pack.manifest or None,
        resources=pack.resources or None,
        tags=pack.tags,
        is_public=is_public,
        source="upload",
    )
    session.add(skill)
    await session.commit()
    await session.refresh(skill)
    return skill


@router.get("", response_model=Page[SkillSchema])
async def list_skills(
    session: SessionDep,
    current_user: OptionalUser,
    q: str | None = Query(None, description="Free text over name/description/tags"),
    tags: str | None = Query(None, description="Comma-separated, AND-matched"),
    owner: str | None = Query(None, description="'me' or a user uuid"),
    agent_id: uuid.UUID | None = Query(None, description="Filter by attached agent"),
    is_public: bool | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> Page[SkillSchema]:
    conditions = []

    # Visibility: public OR owned by the caller.
    visibility = Skill.is_public.is_(True)
    if current_user is not None:
        visibility = or_(visibility, Skill.owner_id == current_user.id)

    if owner == "me":
        if current_user is None:
            return Page(items=[], total=0, limit=limit, offset=offset)
        conditions.append(Skill.owner_id == current_user.id)
    elif owner:
        try:
            owner_uuid = uuid.UUID(owner)
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=400, detail="invalid owner filter") from exc
        conditions.append(Skill.owner_id == owner_uuid)
        conditions.append(visibility)
    else:
        conditions.append(visibility)

    if agent_id is not None:
        conditions.append(Skill.agent_id == agent_id)

    if is_public is not None:
        conditions.append(Skill.is_public.is_(is_public))

    if q:
        like = f"%{q}%"
        conditions.append(
            or_(
                Skill.name.ilike(like),
                Skill.description.ilike(like),
                cast(Skill.tags, String).ilike(like),
            )
        )

    if tags:
        for tag in [t.strip() for t in tags.split(",") if t.strip()]:
            conditions.append(Skill.tags.contains([tag]))

    total = await session.scalar(select(func.count()).select_from(Skill).where(*conditions)) or 0
    rows = (
        await session.scalars(
            select(Skill)
            .where(*conditions)
            .order_by(Skill.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    items = [SkillSchema.model_validate(s) for s in rows]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/{skill_id}", response_model=SkillSchema)
async def get_skill(skill_id: uuid.UUID, session: SessionDep, current_user: OptionalUser) -> Skill:
    skill = await session.get(Skill, skill_id)
    if skill is None or not (
        skill.is_public or (current_user is not None and skill.owner_id == current_user.id)
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="skill not found")
    return skill


@router.patch("/{skill_id}", response_model=SkillSchema)
async def patch_skill(
    skill_id: uuid.UUID,
    body: SkillPatch,
    current_user: CurrentUser,
    session: SessionDep,
) -> Skill:
    skill = await session.get(Skill, skill_id)
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="skill not found")
    if skill.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not the owner")

    # model_dump recursively serializes nested params/executable to plain JSON,
    # which is exactly what the JSONB columns expect.
    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(skill, field, value)
    if "prompt_body" in updates:
        skill.content = updates["prompt_body"]

    await session.commit()
    await session.refresh(skill)
    return skill


@router.delete("/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_skill(skill_id: uuid.UUID, current_user: CurrentUser, session: SessionDep) -> None:
    skill = await session.get(Skill, skill_id)
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="skill not found")
    if skill.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not the owner")
    await session.delete(skill)
    await session.commit()

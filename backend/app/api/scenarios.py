"""Scenario endpoints: list all, get by UUID or key."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import SessionDep
from app.models import Scenario
from app.schemas import Scenario as ScenarioSchema

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


@router.get("", response_model=list[ScenarioSchema])
async def list_scenarios(session: SessionDep) -> list[Scenario]:
    rows = (
        await session.scalars(
            select(Scenario).order_by(Scenario.is_full.desc(), Scenario.key)
        )
    ).all()
    return list(rows)


@router.get("/{id_or_key}", response_model=ScenarioSchema)
async def get_scenario(id_or_key: str, session: SessionDep) -> Scenario:
    scenario: Scenario | None = None
    try:
        scenario_id = uuid.UUID(id_or_key)
        scenario = await session.get(Scenario, scenario_id)
    except (ValueError, TypeError):
        scenario = await session.scalar(select(Scenario).where(Scenario.key == id_or_key))
    if scenario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="scenario not found")
    return scenario

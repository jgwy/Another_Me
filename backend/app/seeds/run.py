"""Idempotent seed runner.

The container entrypoint calls ``python -m app.seeds.run`` on every boot, so this
MUST be safe to re-run. It upserts the four scenarios and the NPC agent roster
(owned by a dedicated system user) so the island always has people to talk to.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select

from app.core.db import async_session_maker
from app.core.security import hash_password
from app.models import Agent, Scenario, Skill, User
from app.seeds.data import NPC_AGENTS, NPC_USER_EMAIL, NPC_USER_NAME, SCENARIOS

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("app.seeds")


async def _ensure_npc_user(session) -> User:
    user = await session.scalar(select(User).where(User.email == NPC_USER_EMAIL))
    if user is None:
        user = User(
            email=NPC_USER_EMAIL,
            username=NPC_USER_NAME,
            password_hash=hash_password("npc-no-login-" + NPC_USER_EMAIL),
        )
        session.add(user)
        await session.flush()
        logger.info("seed: created NPC user %s", NPC_USER_EMAIL)
    return user


async def _upsert_scenarios(session) -> int:
    created = 0
    for data in SCENARIOS:
        scenario = await session.scalar(select(Scenario).where(Scenario.key == data["key"]))
        if scenario is None:
            session.add(Scenario(**data))
            created += 1
        else:
            # Refresh seed-owned content so edits propagate on re-seed.
            for field, value in data.items():
                setattr(scenario, field, value)
    logger.info("seed: scenarios upserted (%d new, %d total)", created, len(SCENARIOS))
    return created


async def _upsert_npc_agents(session, owner: User) -> int:
    created = 0
    for spec in NPC_AGENTS:
        agent = await session.scalar(
            select(Agent).where(Agent.owner_id == owner.id, Agent.name == spec["name"])
        )
        skills = spec.get("skills", [])
        scalar_fields = {
            "persona": spec["persona"],
            "rules": spec["rules"],
            "profile_tags": spec["profile_tags"],
            "avatar": spec.get("avatar"),
            "max_rounds": spec.get("max_rounds", 8),
            "is_public": True,
        }
        if agent is None:
            agent = Agent(owner_id=owner.id, name=spec["name"], questionnaire=None, **scalar_fields)
            session.add(agent)
            await session.flush()
            for s in skills:
                session.add(
                    Skill(
                        agent_id=agent.id,
                        owner_id=owner.id,
                        name=s["name"],
                        content=s.get("content", ""),
                        source=s.get("source", "questionnaire"),
                    )
                )
            created += 1
        else:
            # Update scalar fields only; leave existing skills untouched.
            for field, value in scalar_fields.items():
                setattr(agent, field, value)
    logger.info("seed: NPC agents upserted (%d new, %d total)", created, len(NPC_AGENTS))
    return created


async def _seed() -> None:
    async with async_session_maker() as session:
        owner = await _ensure_npc_user(session)
        await _upsert_scenarios(session)
        await _upsert_npc_agents(session, owner)
        await session.commit()
    logger.info("seed: done")


def main() -> None:
    """Run all seeds. Idempotent (safe on every boot)."""
    asyncio.run(_seed())


if __name__ == "__main__":
    main()

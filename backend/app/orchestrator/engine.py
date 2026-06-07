"""Conversation engine: runs the turn protocol as a background asyncio task,
persisting each message and publishing live SSE events to the in-memory bus.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app import llm
from app.core.config import get_settings
from app.core.db import async_session_maker
from app.models import (
    Agent,
    Conversation,
    ConversationParticipant,
    Dispatch,
    Message,
    SandboxRun,
    Scenario,
)
from app.orchestrator.evolution import generate_evolution
from app.orchestrator.prompts import agent_can_run_code, build_turn_messages, turn_meta
from app.orchestrator.protocol import compute_rounds, plan_turns
from app.orchestrator.pubsub import bus
from app.orchestrator.reports import generate_report
from app.orchestrator.sandbox import extract_python_code, run_code

logger = logging.getLogger("app.orchestrator.engine")

_tasks: dict[str, asyncio.Task] = {}
_semaphore: asyncio.Semaphore | None = None

_ROLES = {
    "exchange": {1: "创业者", 2: "投资人"},
    "cafe": {1: "访客", 2: "访客"},
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _semaphore_for_loop() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(get_settings().max_concurrent_conversations)
    return _semaphore


def _role_for(scenario: Scenario, seat: int) -> str | None:
    return _ROLES.get(scenario.key, {}).get(seat)


def _publish(cid: str, event: str, data: dict[str, Any], seq: int | None = None) -> None:
    payload: dict[str, Any] = {"event": event, "data": data}
    if seq is not None:
        payload["id"] = seq
    bus.publish(cid, payload)


def _format_evidence(result: dict[str, Any]) -> str:
    stdout = (result.get("stdout") or "").strip()
    stderr = (result.get("stderr") or "").strip()
    text = stdout or "(无标准输出)"
    if result.get("timed_out"):
        text += "\n[执行超时]"
    elif int(result.get("exit_code", 0)) != 0 and stderr:
        text += f"\n[stderr] {stderr}"
    return f"运行结果：\n{text}"


async def create_conversation(
    session,
    scenario: Scenario,
    agent1: Agent,
    agent2: Agent,
    *,
    title: str | None = None,
) -> Conversation:
    """Create a pending conversation + its two seated participants (no commit)."""
    n = compute_rounds([agent1.max_rounds, agent2.max_rounds])
    convo = Conversation(
        scenario_id=scenario.id,
        status="pending",
        n_rounds=n,
        title=title or f"{agent1.name} × {agent2.name} @ {scenario.name}",
    )
    session.add(convo)
    await session.flush()
    session.add(
        ConversationParticipant(
            conversation_id=convo.id, agent_id=agent1.id, seat=1, role=_role_for(scenario, 1)
        )
    )
    session.add(
        ConversationParticipant(
            conversation_id=convo.id, agent_id=agent2.id, seat=2, role=_role_for(scenario, 2)
        )
    )
    await session.flush()
    return convo


def start(conversation_id: uuid.UUID) -> None:
    """Schedule a conversation to run in the background (idempotent)."""
    cid = str(conversation_id)
    existing = _tasks.get(cid)
    if existing is not None and not existing.done():
        return
    _tasks[cid] = asyncio.create_task(run_conversation(conversation_id))


async def manual_start(
    scenario_id: uuid.UUID,
    agent1_id: uuid.UUID,
    agent2_id: uuid.UUID,
    *,
    title: str | None = None,
) -> Conversation:
    """Manual trigger: create a conversation for two agents and start it."""
    async with async_session_maker() as session:
        scenario = await session.get(Scenario, scenario_id)
        agent1 = await session.scalar(
            select(Agent).where(Agent.id == agent1_id).options(selectinload(Agent.skills))
        )
        agent2 = await session.scalar(
            select(Agent).where(Agent.id == agent2_id).options(selectinload(Agent.skills))
        )
        if scenario is None or agent1 is None or agent2 is None:
            raise ValueError("scenario or agents not found")
        convo = await create_conversation(session, scenario, agent1, agent2, title=title)
        await session.commit()
        convo_id = convo.id
    start(convo_id)
    return convo


async def run_conversation(
    conversation_id: uuid.UUID,
    *,
    task_prompt: str | None = None,
    dispatched_agent_id: uuid.UUID | None = None,
) -> None:
    """Run a conversation to completion.

    ``task_prompt`` / ``dispatched_agent_id`` let a caller (e.g. the trip engine)
    drive the turn without a :class:`Dispatch` row; when omitted they are derived
    from a Dispatch linked to the conversation (legacy path). Trips ``await`` this
    directly so each encounter finishes before the next leg begins.
    """
    async with _semaphore_for_loop():
        try:
            await _run(
                conversation_id,
                task_prompt=task_prompt,
                dispatched_agent_id=dispatched_agent_id,
            )
        except Exception:  # noqa: BLE001
            logger.exception("conversation %s failed", conversation_id)
            await _mark_failed(conversation_id)
        finally:
            _tasks.pop(str(conversation_id), None)


async def _add_message(
    session,
    conversation_id: uuid.UUID,
    seq: int,
    sender: str,
    content: str,
    *,
    turn_index: int | None = None,
    agent_id: uuid.UUID | None = None,
    meta: dict | None = None,
    message_id: uuid.UUID | None = None,
) -> Message:
    msg = Message(
        id=message_id or uuid.uuid4(),
        conversation_id=conversation_id,
        seq=seq,
        turn_index=turn_index,
        agent_id=agent_id,
        sender=sender,
        content=content,
        meta=meta,
    )
    session.add(msg)
    await session.flush()
    return msg


async def _run(
    conversation_id: uuid.UUID,
    *,
    task_prompt: str | None = None,
    dispatched_agent_id: uuid.UUID | None = None,
) -> None:
    settings = get_settings()
    cid = str(conversation_id)
    async with async_session_maker() as session:
        convo = await session.get(Conversation, conversation_id)
        if convo is None:
            return
        if convo.status not in ("pending",):
            return  # already running/completed elsewhere

        participants = (
            await session.scalars(
                select(ConversationParticipant)
                .where(ConversationParticipant.conversation_id == conversation_id)
                .order_by(ConversationParticipant.seat)
                .options(
                    selectinload(ConversationParticipant.agent).selectinload(Agent.skills)
                )
            )
        ).all()
        if len(participants) < 2:
            raise ValueError("conversation needs two participants")

        scenario = await session.get(Scenario, convo.scenario_id)
        if scenario is None:
            raise ValueError("scenario missing")

        agent1 = participants[0].agent
        agent2 = participants[1].agent
        agents_by_seat = {1: agent1, 2: agent2}
        names = {1: agent1.name, 2: agent2.name}

        n = compute_rounds([agent1.max_rounds, agent2.max_rounds])
        convo.n_rounds = n
        convo.status = "running"
        convo.started_at = _now()

        # Task + dispatched twin come from the caller (trip engine) when provided,
        # else from a Dispatch linked to this conversation (legacy 1:1 path).
        dispatch = await session.scalar(
            select(Dispatch).where(Dispatch.conversation_id == conversation_id)
        )
        effective_task = task_prompt if task_prompt is not None else (
            dispatch.task_prompt if dispatch else ""
        )
        effective_dispatched_id = dispatched_agent_id if dispatched_agent_id is not None else (
            dispatch.agent_id if dispatch else agent1.id
        )
        if dispatch is not None:
            dispatch.status = "running"
        await session.commit()

        history: list[Message] = []
        seq = 0

        # Scene intro as a system message (visible to spectators).
        scene = await _add_message(
            session, conversation_id, seq, "system", scenario.scene_prompt, meta={"phase": "scene"}
        )
        await session.commit()
        _publish(
            cid,
            "message-start",
            {
                "conversation_id": cid,
                "message_id": str(scene.id),
                "seq": seq,
                "turn_index": None,
                "agent_id": None,
                "sender": "system",
            },
            seq,
        )
        _publish(
            cid,
            "message-end",
            {
                "conversation_id": cid,
                "message_id": str(scene.id),
                "seq": seq,
                "turn_index": None,
                "agent_id": None,
                "sender": "system",
                "content": scene.content,
                "meta": scene.meta or {},
            },
            seq,
        )
        history.append(scene)
        seq += 1

        for step in plan_turns(n):
            acting = agents_by_seat[step.seat]
            opponent_name = names[2 if step.seat == 1 else 1]
            # run_code is gated per **acting** agent (refactor-2 §3): the scenario
            # allows it, or this agent carries an executable script skill.
            can_run_code = agent_can_run_code(acting, scenario)
            has_evidence = any(m.sender == "sandbox" for m in history)
            encourage_code = (
                can_run_code and step.seat == 1 and step.turn_index == 3 and not has_evidence
            )

            messages = build_turn_messages(
                acting,
                scenario,
                opponent_name=opponent_name,
                task_prompt=effective_task,
                ending_active=step.ending_active,
                can_run_code=can_run_code,
                history=history,
            )
            meta = turn_meta(
                acting,
                scenario,
                opponent_name=opponent_name,
                seat=step.seat,
                turn_index=step.turn_index,
                n_rounds=n,
                ending_active=step.ending_active,
                can_run_code=can_run_code,
                encourage_code=encourage_code,
                has_evidence=has_evidence,
                task_prompt=effective_task,
            )

            message_id = uuid.uuid4()
            msg = await _add_message(
                session,
                conversation_id,
                seq,
                "agent",
                "",
                turn_index=step.turn_index,
                agent_id=acting.id,
                message_id=message_id,
            )
            await session.commit()
            _publish(
                cid,
                "message-start",
                {
                    "conversation_id": cid,
                    "message_id": str(message_id),
                    "seq": seq,
                    "turn_index": step.turn_index,
                    "agent_id": str(acting.id),
                    "sender": "agent",
                },
                seq,
            )

            acc = ""
            async for delta in llm.stream(messages, meta=meta, temperature=0.8, max_tokens=700):
                acc += delta
                _publish(
                    cid,
                    "message-delta",
                    {
                        "conversation_id": cid,
                        "message_id": str(message_id),
                        "seq": seq,
                        "delta": delta,
                    },
                    seq,
                )
            acc = acc.strip() or "(沉默)"
            code = extract_python_code(acc)
            msg.content = acc
            msg.meta = {"has_code": True, "language": "python"} if code else None
            await session.commit()
            _publish(
                cid,
                "message-end",
                {
                    "conversation_id": cid,
                    "message_id": str(message_id),
                    "seq": seq,
                    "turn_index": step.turn_index,
                    "agent_id": str(acting.id),
                    "sender": "agent",
                    "content": acc,
                    "meta": msg.meta or {},
                },
                seq,
            )
            history.append(msg)
            seq += 1

            if code and can_run_code:
                result = await run_code(code, timeout_seconds=settings.sandbox_timeout_seconds)
                run_row = SandboxRun(
                    conversation_id=conversation_id,
                    agent_id=acting.id,
                    message_id=message_id,
                    language=result.get("language", "python"),
                    code=code,
                    stdout=result.get("stdout", ""),
                    stderr=result.get("stderr", ""),
                    exit_code=int(result.get("exit_code", 0)),
                    duration_ms=int(result.get("duration_ms", 0)),
                )
                session.add(run_row)
                await session.flush()
                evidence = await _add_message(
                    session,
                    conversation_id,
                    seq,
                    "sandbox",
                    _format_evidence(result),
                    agent_id=acting.id,
                    meta={
                        "sandbox_run_id": str(run_row.id),
                        "exit_code": int(result.get("exit_code", 0)),
                        "duration_ms": int(result.get("duration_ms", 0)),
                        "timed_out": bool(result.get("timed_out", False)),
                        "language": result.get("language", "python"),
                    },
                )
                await session.commit()
                _publish(
                    cid,
                    "sandbox-output",
                    {
                        "conversation_id": cid,
                        "message_id": str(evidence.id),
                        "sandbox_run_id": str(run_row.id),
                        "agent_id": str(acting.id),
                        "language": result.get("language", "python"),
                        "stdout": result.get("stdout", ""),
                        "stderr": result.get("stderr", ""),
                        "exit_code": int(result.get("exit_code", 0)),
                        "duration_ms": int(result.get("duration_ms", 0)),
                    },
                    seq,
                )
                history.append(evidence)
                seq += 1

        # Wrap up: status, report, evolution.
        convo.status = "completed"
        convo.ended_at = _now()
        if dispatch is not None:
            dispatch.status = "completed"
        await session.commit()

        report = await generate_report(session, convo, scenario, [agent1, agent2], history)
        dispatched = agent2 if effective_dispatched_id == agent2.id else agent1
        await generate_evolution(session, dispatched, convo, scenario)
        await session.commit()

        _publish(
            cid,
            "conversation-end",
            {
                "conversation_id": cid,
                "status": "completed",
                "n_rounds": n,
                "report_id": str(report.id),
            },
        )


async def _mark_failed(conversation_id: uuid.UUID) -> None:
    try:
        async with async_session_maker() as session:
            convo = await session.get(Conversation, conversation_id)
            if convo is not None and convo.status not in ("completed", "failed"):
                convo.status = "failed"
                convo.ended_at = _now()
                dispatch = await session.scalar(
                    select(Dispatch).where(Dispatch.conversation_id == conversation_id)
                )
                if dispatch is not None:
                    dispatch.status = "failed"
                await session.commit()
    except Exception:  # noqa: BLE001
        logger.exception("failed to mark conversation %s failed", conversation_id)
    bus.publish(
        str(conversation_id),
        {
            "event": "conversation-end",
            "data": {"conversation_id": str(conversation_id), "status": "failed", "n_rounds": 0},
        },
    )

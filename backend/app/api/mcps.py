"""MCP server endpoints (ported from Xyzen ``api/v1/mcps.py``).

CRUD for registering MCP tool servers plus ``POST /api/mcps/{id}/connect``, which
probes the server **inside the sandbox** and caches its discovered tools (see
:mod:`app.services.mcp_connect`). Xyzen connected directly from the API process
with ``fastmcp.Client``; here every connection is driven through the
sandbox-runner boundary so the backend never opens outbound sockets to
user-registered servers.

Secrets are **write-only**: ``token`` is accepted on create/patch but is absent
from the response schema, and ``config`` is credential-stripped on the way out by
:func:`app.services.mcp_connect.serialize_mcp_server`.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Agent, McpServer
from app.schemas import (
    McpConnectResponse,
    McpServerCreate,
    McpServerPatch,
    Page,
)
from app.schemas import McpServer as McpServerSchema
from app.services.mcp_connect import connect_in_sandbox, serialize_mcp_server

router = APIRouter(prefix="/mcps", tags=["mcps"])

_VALID_TRANSPORTS = {"stdio", "sse", "http"}


def _validate_transport(transport: str | None) -> None:
    if transport is not None and transport not in _VALID_TRANSPORTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"invalid transport (expected one of {sorted(_VALID_TRANSPORTS)})",
        )


async def _require_owned_agent(
    agent_id: uuid.UUID, current_user: CurrentUser, session: SessionDep
) -> None:
    agent = await session.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="agent not found")
    if agent.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="not the owner of agent_id"
        )


@router.post("", response_model=McpServerSchema, status_code=status.HTTP_201_CREATED)
async def create_mcp_server(
    body: McpServerCreate, current_user: CurrentUser, session: SessionDep
) -> McpServerSchema:
    """Register an MCP server owned by the caller (optionally attached to an agent)."""
    _validate_transport(body.transport)
    if body.agent_id is not None:
        await _require_owned_agent(body.agent_id, current_user, session)

    server = McpServer(
        owner_id=current_user.id,
        agent_id=body.agent_id,
        name=body.name,
        description=body.description,
        category=body.category or "general",
        transport=body.transport or "sse",
        command=body.command,
        url=body.url,
        token=body.token,
        config=body.config,
        status="unknown",
        is_public=body.is_public,
    )
    session.add(server)
    await session.commit()
    await session.refresh(server)
    return serialize_mcp_server(server)


@router.get("", response_model=Page[McpServerSchema])
async def list_mcp_servers(
    current_user: CurrentUser,
    session: SessionDep,
    owner: str | None = Query(None, description="'me' or a user uuid"),
    agent_id: uuid.UUID | None = Query(None, description="Filter by attached agent"),
    category: str | None = Query(None),
    q: str | None = Query(None, description="Free text over name/description"),
    is_public: bool | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> Page[McpServerSchema]:
    """List MCP servers visible to the caller (owned + public)."""
    conditions = []

    # Visibility: public OR owned by the caller.
    visibility = or_(McpServer.is_public.is_(True), McpServer.owner_id == current_user.id)

    if owner == "me":
        conditions.append(McpServer.owner_id == current_user.id)
    elif owner:
        try:
            owner_uuid = uuid.UUID(owner)
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=400, detail="invalid owner filter") from exc
        conditions.append(McpServer.owner_id == owner_uuid)
        conditions.append(visibility)
    else:
        conditions.append(visibility)

    if agent_id is not None:
        conditions.append(McpServer.agent_id == agent_id)
    if category:
        conditions.append(McpServer.category == category)
    if is_public is not None:
        conditions.append(McpServer.is_public.is_(is_public))
    if q:
        like = f"%{q}%"
        conditions.append(or_(McpServer.name.ilike(like), McpServer.description.ilike(like)))

    total = (
        await session.scalar(select(func.count()).select_from(McpServer).where(*conditions)) or 0
    )
    rows = (
        await session.scalars(
            select(McpServer)
            .where(*conditions)
            .order_by(McpServer.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    items = [serialize_mcp_server(s) for s in rows]
    return Page(items=items, total=total, limit=limit, offset=offset)


async def _get_visible(
    mcp_server_id: uuid.UUID, current_user: CurrentUser, session: SessionDep
) -> McpServer:
    server = await session.get(McpServer, mcp_server_id)
    if server is None or not (server.is_public or server.owner_id == current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="mcp server not found")
    return server


async def _get_owned(
    mcp_server_id: uuid.UUID, current_user: CurrentUser, session: SessionDep
) -> McpServer:
    server = await session.get(McpServer, mcp_server_id)
    if server is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="mcp server not found")
    if server.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not the owner")
    return server


@router.get("/{mcp_server_id}", response_model=McpServerSchema)
async def get_mcp_server(
    mcp_server_id: uuid.UUID, current_user: CurrentUser, session: SessionDep
) -> McpServerSchema:
    server = await _get_visible(mcp_server_id, current_user, session)
    return serialize_mcp_server(server)


@router.patch("/{mcp_server_id}", response_model=McpServerSchema)
async def update_mcp_server(
    mcp_server_id: uuid.UUID,
    body: McpServerPatch,
    current_user: CurrentUser,
    session: SessionDep,
) -> McpServerSchema:
    server = await _get_owned(mcp_server_id, current_user, session)

    updates = body.model_dump(exclude_unset=True)
    if "transport" in updates:
        _validate_transport(updates["transport"])
    if updates.get("agent_id") is not None:
        await _require_owned_agent(updates["agent_id"], current_user, session)

    for field, value in updates.items():
        setattr(server, field, value)

    await session.commit()
    await session.refresh(server)
    return serialize_mcp_server(server)


@router.delete("/{mcp_server_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mcp_server(
    mcp_server_id: uuid.UUID, current_user: CurrentUser, session: SessionDep
) -> None:
    server = await _get_owned(mcp_server_id, current_user, session)
    await session.delete(server)
    await session.commit()


@router.post("/{mcp_server_id}/connect", response_model=McpConnectResponse)
async def connect_mcp_server(
    mcp_server_id: uuid.UUID, current_user: CurrentUser, session: SessionDep
) -> McpConnectResponse:
    """Probe/connect the server inside the sandbox and discover its tools.

    Runs the MCP handshake through the sandbox-runner boundary, then caches the
    resulting ``status`` / ``tools`` / ``last_checked_at`` on the row (owner only).
    """
    server = await _get_owned(mcp_server_id, current_user, session)

    probe = await connect_in_sandbox(server)
    server.status = probe.get("status") or "error"
    server.tools = probe.get("tools") or []
    server.last_checked_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(server)

    return McpConnectResponse(
        id=server.id,
        status=server.status,
        tools=server.tools or [],
        error=probe.get("error"),
    )

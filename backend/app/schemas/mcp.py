"""MCP server schemas (ported from Xyzen, enriched per the refactor plan).

Lock contract for ``/api/mcps`` (list/add/get/patch/delete/connect). Bodies are
filled by Phase 2 (the skills-market / sandbox workstream); shapes here are final.

Secrets (``token`` and any secret-bearing ``config`` keys) are **write-only**: they
are accepted on create/patch but never serialized back in :class:`McpServer`.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# transport: stdio | sse | http
# status:    unknown | online | offline | error


class McpServer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID
    # null ⇒ a library/standalone server; otherwise attached to this agent.
    agent_id: uuid.UUID | None = None
    name: str
    description: str = ""
    category: str = "general"
    transport: str = "sse"
    command: str | None = None
    url: str | None = None
    # Non-secret connection config (args/env/headers). Secrets are stripped.
    config: dict[str, Any] | None = None
    status: str = "unknown"
    # Discovered tools: [{name, description, inputSchema}, ...] (null until probed).
    tools: list[dict[str, Any]] | None = None
    is_public: bool = False
    last_checked_at: datetime | None = None
    created_at: datetime
    updated_at: datetime | None = None


class McpServerCreate(BaseModel):
    name: str
    description: str = ""
    category: str = "general"
    transport: str = "sse"
    # Provide ``command`` for stdio transport, or ``url`` for sse/http.
    command: str | None = None
    url: str | None = None
    # Write-only auth bearer (Xyzen-compatible); never echoed back.
    token: str | None = None
    config: dict[str, Any] | None = None
    # Optional attach to an agent (null ⇒ a library server).
    agent_id: uuid.UUID | None = None
    is_public: bool = False


class McpServerPatch(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
    transport: str | None = None
    command: str | None = None
    url: str | None = None
    token: str | None = None
    config: dict[str, Any] | None = None
    agent_id: uuid.UUID | None = None
    is_public: bool | None = None


class McpConnectResponse(BaseModel):
    """Result of probing/connecting an MCP server (``POST /api/mcps/{id}/connect``)."""

    id: uuid.UUID
    status: str
    tools: list[dict[str, Any]] = Field(default_factory=list)
    error: str | None = None

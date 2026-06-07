"""MCP server model — a Model-Context-Protocol tool server (ported from Xyzen).

An :class:`McpServer` describes how the sandbox connects to an MCP tool server so
that its tools can be invoked during encounters. Ported from Xyzen's
``service/app/models/mcp.py`` (``user_id``→``owner_id``, ``url``/``token``/
``status``/``tools``/``last_checked_at``) and enriched per the refactor plan with
``transport`` / ``command`` / ``config`` (stdio vs remote), ``category`` and an
optional ``agent_id`` attach link.

Connection / runtime (status probing, tool discovery, in-sandbox connect) is owned
by Phase 2 — this is the model + migration only. Secrets (``token`` / anything in
``config``) are write-only and stripped from API responses.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Text, Uuid, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.agent import Agent


class McpServer(Base):
    """A registered MCP tool server, optionally attached to an agent."""

    __tablename__ = "mcp_servers"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Optional attach to a specific agent (null ⇒ a library/standalone server).
    agent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("agents.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column()
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    category: Mapped[str] = mapped_column(default="general", server_default="general", index=True)
    # How the sandbox connects: "stdio" (spawn ``command``) | "sse" | "http" (``url``).
    transport: Mapped[str] = mapped_column(default="sse", server_default="sse")
    # For stdio transport: the launch command (e.g. "npx -y @scope/server").
    command: Mapped[str | None] = mapped_column(Text, nullable=True)
    # For sse/http transport: the server URL.
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Write-only auth bearer (Xyzen-compatible). Never serialized in responses.
    token: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Extra connection config (args/env/headers/…). May hold secrets ⇒ sanitized
    # before serialization by the Phase 2 connect logic.
    config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Connection status cache: "unknown" | "online" | "offline" | "error".
    status: Mapped[str] = mapped_column(default="unknown", server_default="unknown", index=True)
    # Discovered tool descriptors: [{name, description, inputSchema}, ...].
    tools: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_public: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    agent: Mapped["Agent | None"] = relationship(foreign_keys=[agent_id])

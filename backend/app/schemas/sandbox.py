"""Sandbox run schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SandboxRun(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    conversation_id: uuid.UUID | None = None
    agent_id: uuid.UUID | None = None
    message_id: uuid.UUID | None = None
    language: str
    code: str
    stdout: str
    stderr: str
    exit_code: int
    duration_ms: int
    created_at: datetime


class SandboxRunRequest(BaseModel):
    """Body for the authed ``POST /api/sandbox/run`` pass-through (mirrors the
    runner's ``/run`` request, contract §5)."""

    code: str = Field(min_length=1)
    language: str = "python"
    # Per-run timeout hint; the server clamps it to ``SANDBOX_TIMEOUT_SECONDS``.
    timeout_seconds: int | None = Field(default=None, ge=1, le=60)
    stdin: str = ""


class SandboxRunResult(BaseModel):
    """Result of a sandbox run (mirrors the runner's ``/run`` 200 shape)."""

    stdout: str = ""
    stderr: str = ""
    exit_code: int = 0
    duration_ms: int = 0
    timed_out: bool = False
    language: str = "python"

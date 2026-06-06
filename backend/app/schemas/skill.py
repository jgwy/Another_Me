"""Skill schemas (v2: standalone, structured capability pack).

A Skill is a reusable capability pack — ``name / description / prompt_body /
params / tags`` — that can stand alone (``agent_id == null``, a library skill) or
be attached to an agent. ``executable`` is a **reserved hook** for future
script/MCP execution (not implemented this round).

Back-compat: the v1 field ``content`` is kept as a deprecated alias for
``prompt_body`` so existing rows and the questionnaire/upload path keep working
until the backend-features workstream migrates the model + backfills.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SkillParam(BaseModel):
    """A declared input parameter for a skill (drives the fork/run form)."""

    name: str
    # string | number | boolean | enum
    type: str = "string"
    label: str | None = None
    required: bool = False
    default: Any | None = None
    options: list[str] = Field(default_factory=list)
    description: str | None = None


class SkillExecutable(BaseModel):
    """Reserved hook for executable skills (script/MCP). Not executed this round."""

    # none | script | mcp
    kind: str = "none"
    ref: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)


class Skill(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    agent_id: uuid.UUID | None = None
    owner_id: uuid.UUID
    name: str
    description: str = ""
    # Primary capability text. Supersedes the deprecated ``content`` alias.
    prompt_body: str = ""
    # Deprecated alias of ``prompt_body`` (kept during migration).
    content: str = ""
    params: list[SkillParam] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    executable: SkillExecutable | None = None
    source: str = "upload"
    is_public: bool = False
    created_at: datetime
    updated_at: datetime | None = None

    @model_validator(mode="after")
    def _mirror_body_and_content(self) -> "Skill":
        # Keep prompt_body/content consistent during the v1→v2 transition so
        # clients can read either one regardless of which the row populated.
        if not self.prompt_body and self.content:
            self.prompt_body = self.content
        elif not self.content and self.prompt_body:
            self.content = self.prompt_body
        return self


class SkillCreate(BaseModel):
    name: str
    description: str = ""
    prompt_body: str = ""
    # Back-compat input: if prompt_body is empty, content is used as the body.
    content: str = ""
    params: list[SkillParam] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    executable: SkillExecutable | None = None
    # null → a standalone library skill; otherwise attach to this agent.
    agent_id: uuid.UUID | None = None
    is_public: bool = False
    source: str = "upload"


class SkillPatch(BaseModel):
    name: str | None = None
    description: str | None = None
    prompt_body: str | None = None
    params: list[SkillParam] | None = None
    tags: list[str] | None = None
    executable: SkillExecutable | None = None
    is_public: bool | None = None

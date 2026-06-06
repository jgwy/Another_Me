"""Agent schemas."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.skill import Skill, SkillCreate


class AgentSummary(BaseModel):
    """Lightweight agent shape nested in participants and listings."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    avatar: str | None = None
    profile_tags: list[str] = Field(default_factory=list)


class Agent(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    persona: str
    rules: dict
    # Structured social-twin brain (see app.schemas.prompt_config.PromptConfig).
    # Empty {} for legacy agents.
    prompt_config: dict = Field(default_factory=dict)
    profile_tags: list[str] = Field(default_factory=list)
    questionnaire: dict | None = None
    avatar: str | None = None
    max_rounds: int
    is_public: bool
    forked_from: uuid.UUID | None = None
    # Marketplace v2: version of the listing this agent was forked from (lineage sync).
    source_version: int | None = None
    skills: list[Skill] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class AgentCreate(BaseModel):
    name: str
    questionnaire: dict = Field(default_factory=dict)
    uploaded_skills: list[SkillCreate] = Field(default_factory=list)
    # Optional structured brain draft (e.g. from POST /api/agents/generate or the
    # tuning JSON editor). When omitted, the server synthesizes one.
    prompt_config: dict | None = None
    # Optional ids of standalone/library skills to attach to the new agent.
    skill_ids: list[uuid.UUID] = Field(default_factory=list)
    max_rounds: int = 8
    is_public: bool = False
    avatar: str | None = None


class AgentPatch(BaseModel):
    name: str | None = None
    persona: str | None = None
    rules: dict | None = None
    prompt_config: dict | None = None
    profile_tags: list[str] | None = None
    max_rounds: int | None = None
    is_public: bool | None = None
    avatar: str | None = None


class AgentForkRequest(BaseModel):
    name: str | None = None


# --- POST /api/agents/generate (NL / corpus → prompt_config draft; §3) ------- #


class AgentGenerateRequest(BaseModel):
    """Draft a social-twin brain from natural language or a personal corpus."""

    # "nl"     → free-form description / skill-creator-style guided answers
    # "corpus" → pasted chats / writing to distill from (Second-Me–style modeling)
    mode: str = "nl"
    input: str
    name: str | None = None
    # Optional hints: prior answers, an existing prompt_config to refine, etc.
    context: dict = Field(default_factory=dict)


class SkillDraft(BaseModel):
    name: str
    content: str = ""


class AgentGenerateResponse(BaseModel):
    """A non-persisted draft the client can review, tweak, then POST to /api/agents."""

    name: str
    # A PromptConfig draft (see app.schemas.prompt_config.PromptConfig).
    prompt_config: dict[str, Any] = Field(default_factory=dict)
    persona: str = ""
    rules: dict[str, Any] = Field(default_factory=dict)
    profile_tags: list[str] = Field(default_factory=list)
    skills: list[SkillDraft] = Field(default_factory=list)
    # Skill-creator-style clarifying follow-ups (may be empty when confident).
    questions: list[str] = Field(default_factory=list)

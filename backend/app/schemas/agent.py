"""Agent schemas."""

import uuid
from datetime import datetime

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
    profile_tags: list[str] = Field(default_factory=list)
    questionnaire: dict | None = None
    avatar: str | None = None
    max_rounds: int
    is_public: bool
    forked_from: uuid.UUID | None = None
    skills: list[Skill] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class AgentCreate(BaseModel):
    name: str
    questionnaire: dict = Field(default_factory=dict)
    uploaded_skills: list[SkillCreate] = Field(default_factory=list)
    max_rounds: int = 8
    is_public: bool = False
    avatar: str | None = None


class AgentPatch(BaseModel):
    name: str | None = None
    persona: str | None = None
    rules: dict | None = None
    profile_tags: list[str] | None = None
    max_rounds: int | None = None
    is_public: bool | None = None
    avatar: str | None = None


class AgentForkRequest(BaseModel):
    name: str | None = None

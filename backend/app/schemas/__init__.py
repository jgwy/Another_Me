"""Pydantic schemas package — request/response models matching the API contract."""

from app.schemas.agent import (
    Agent,
    AgentCreate,
    AgentForkRequest,
    AgentPatch,
    AgentSummary,
)
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest
from app.schemas.common import Page
from app.schemas.conversation import Conversation, Participant
from app.schemas.dispatch import Dispatch, DispatchCreate
from app.schemas.evolution import Evolution, EvolutionApply
from app.schemas.marketplace import (
    MarketplaceCreate,
    MarketplaceForkResponse,
    MarketplaceItem,
    PointsResponse,
)
from app.schemas.message import Message
from app.schemas.report import Report
from app.schemas.sandbox import SandboxRun
from app.schemas.scenario import Scenario
from app.schemas.skill import Skill, SkillCreate
from app.schemas.user import User

__all__ = [
    "Page",
    "User",
    "AuthResponse",
    "RegisterRequest",
    "LoginRequest",
    "Agent",
    "AgentSummary",
    "AgentCreate",
    "AgentPatch",
    "AgentForkRequest",
    "Skill",
    "SkillCreate",
    "Scenario",
    "Dispatch",
    "DispatchCreate",
    "Conversation",
    "Participant",
    "Message",
    "Report",
    "Evolution",
    "EvolutionApply",
    "SandboxRun",
    "MarketplaceItem",
    "MarketplaceCreate",
    "MarketplaceForkResponse",
    "PointsResponse",
]

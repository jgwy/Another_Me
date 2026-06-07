"""Pydantic schemas package — request/response models matching the API contract."""

from app.schemas.agent import (
    Agent,
    AgentCreate,
    AgentForkRequest,
    AgentGenerateRequest,
    AgentGenerateResponse,
    AgentPatch,
    AgentSummary,
    SkillDraft,
)
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest
from app.schemas.common import Page
from app.schemas.conversation import Conversation, Participant
from app.schemas.dispatch import Dispatch, DispatchCreate
from app.schemas.evolution import Evolution, EvolutionApply
from app.schemas.inbox import InboxReadAllResponse, Notification, UnreadCountResponse
from app.schemas.marketplace import (
    MarketplaceCreate,
    MarketplaceForkResponse,
    MarketplaceItem,
    MarketplaceLikeResponse,
    MarketplacePublishRequest,
    MarketplaceVersion,
    PointsResponse,
)
from app.schemas.mcp import (
    McpConnectResponse,
    McpServer,
    McpServerCreate,
    McpServerPatch,
)
from app.schemas.message import Message
from app.schemas.presence import (
    PresenceEnterRequest,
    PresenceEntry,
    PresenceLeaveRequest,
    PresenceLeaveResponse,
    PresenceSnapshot,
)
from app.schemas.prompt_config import PromptConfig
from app.schemas.relationship import Relationship, RelationshipGraph, RelationshipNode
from app.schemas.report import Report
from app.schemas.sandbox import SandboxRun, SandboxRunRequest, SandboxRunResult
from app.schemas.scenario import Scenario, ScenarioCreate
from app.schemas.skill import Skill, SkillCreate, SkillExecutable, SkillParam, SkillPatch
from app.schemas.trip import Trip, TripCreate, TripEncounter, TripPlan, TripStop
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
    "AgentGenerateRequest",
    "AgentGenerateResponse",
    "SkillDraft",
    "PromptConfig",
    "Skill",
    "SkillCreate",
    "SkillPatch",
    "SkillParam",
    "SkillExecutable",
    "Scenario",
    "ScenarioCreate",
    "McpServer",
    "McpServerCreate",
    "McpServerPatch",
    "McpConnectResponse",
    "PresenceEntry",
    "PresenceSnapshot",
    "PresenceEnterRequest",
    "PresenceLeaveRequest",
    "PresenceLeaveResponse",
    "Dispatch",
    "DispatchCreate",
    "Conversation",
    "Participant",
    "Message",
    "Report",
    "Evolution",
    "EvolutionApply",
    "SandboxRun",
    "SandboxRunRequest",
    "SandboxRunResult",
    "MarketplaceItem",
    "MarketplaceCreate",
    "MarketplaceForkResponse",
    "MarketplaceLikeResponse",
    "MarketplacePublishRequest",
    "MarketplaceVersion",
    "PointsResponse",
    "Trip",
    "TripCreate",
    "TripEncounter",
    "TripPlan",
    "TripStop",
    "Notification",
    "UnreadCountResponse",
    "InboxReadAllResponse",
    "Relationship",
    "RelationshipNode",
    "RelationshipGraph",
]

"""ORM models package.

Importing this package registers every model on ``Base.metadata`` so that
Alembic autogenerate and ``create_all`` see the full schema.
"""

from __future__ import annotations

from app.models.agent import Agent
from app.models.base import Base
from app.models.conversation import Conversation, ConversationParticipant, Message
from app.models.dispatch import Dispatch
from app.models.evolution import Evolution
from app.models.marketplace import MarketplaceItem, MarketplaceLike, MarketplaceVersion
from app.models.mcp import McpServer
from app.models.notification import Notification
from app.models.relationship import Relationship
from app.models.report import Report
from app.models.sandbox_run import SandboxRun
from app.models.scenario import Scenario
from app.models.skill import Skill
from app.models.trip import Trip, TripEncounter
from app.models.user import User

__all__ = [
    "Base",
    "User",
    "Agent",
    "Skill",
    "Scenario",
    "Dispatch",
    "Conversation",
    "ConversationParticipant",
    "Message",
    "Report",
    "Evolution",
    "SandboxRun",
    "MarketplaceItem",
    "MarketplaceVersion",
    "MarketplaceLike",
    "McpServer",
    "Trip",
    "TripEncounter",
    "Notification",
    "Relationship",
]

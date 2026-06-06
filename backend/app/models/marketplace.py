"""Marketplace models — a published agent or skill, with v2 versioning + social.

* :class:`MarketplaceItem` — the listing (extended in v2 with version / fork_mode /
  likes / forks / views / snapshot). ``downloads`` is kept as the v1 alias of
  ``forks`` (the two are written together).
* :class:`MarketplaceVersion` — an immutable published snapshot of the listing at a
  point in time (newest = ``MarketplaceItem.version``).
* :class:`MarketplaceLike` — a per-user like (toggle), uniqued on (item, user).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class MarketplaceItem(Base):
    __tablename__ = "marketplace_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(index=True)
    ref_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column()
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price_points: Mapped[int] = mapped_column(default=0)
    downloads: Mapped[int] = mapped_column(default=0)
    # --- v2: immutable snapshot/version + fork mode + social signals --------
    version: Mapped[int] = mapped_column(Integer, default=1, server_default=text("1"))
    # editable | locked
    fork_mode: Mapped[str] = mapped_column(default="editable", server_default="editable")
    likes: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    # Canonical fork counter; ``downloads`` mirrors it for v1 back-compat.
    forks: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    views: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    # Immutable content of the latest published version (credentials stripped).
    snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class MarketplaceVersion(Base):
    """An immutable published snapshot of a listing (newest first by ``version``)."""

    __tablename__ = "marketplace_versions"
    __table_args__ = (
        UniqueConstraint("item_id", "version", name="uq_marketplace_version_item_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("marketplace_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSONB, default=dict)
    changelog: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MarketplaceLike(Base):
    """A user's like on a listing (toggle). Uniqued on (item_id, user_id)."""

    __tablename__ = "marketplace_likes"
    __table_args__ = (
        UniqueConstraint("item_id", "user_id", name="uq_marketplace_like_item_user"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("marketplace_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

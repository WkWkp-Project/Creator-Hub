"""Content DB — a separate module (does NOT modify existing models/routers).

A `ContentBrief` is a campaign briefing document with two flexible sections:

  Section A — inputs/overview:
    1. product       (Product Information)
    2. kol_brief     (KOL Brief)
    3. extra         (reserved — fill in later without a migration)

  Section B — detailed breakdown (deliverables, timeline, budget, audience,
              KPIs, references, approval).

Both sections are stored as JSON so topics/fields can be added or changed later
without altering the database schema.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import DateTime, Integer, String, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base

CONTENT_STATUSES = {"draft", "review", "approved"}


class ContentBrief(Base):
    __tablename__ = "content_briefs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200), index=True)
    # Loose link to an existing campaign (kept simple, mirrors influencer_ids style).
    campaign_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)

    # Flexible content — see module docstring.
    section_a: Mapped[dict] = mapped_column(JSON, default=dict)
    section_b: Mapped[dict] = mapped_column(JSON, default=dict)
    notes: Mapped[str] = mapped_column(Text, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


# ---------- schemas ----------

class ContentBriefBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    campaign_id: int | None = None
    status: str = "draft"
    section_a: dict[str, Any] = Field(default_factory=dict)
    section_b: dict[str, Any] = Field(default_factory=dict)
    notes: str = ""

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        if v not in CONTENT_STATUSES:
            raise ValueError(f"Status must be one of {sorted(CONTENT_STATUSES)}")
        return v


class ContentBriefCreate(ContentBriefBase):
    pass


class ContentBriefUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str | None = Field(None, min_length=1, max_length=200)
    campaign_id: int | None = None
    status: str | None = None
    section_a: dict[str, Any] | None = None
    section_b: dict[str, Any] | None = None
    notes: str | None = None

    @field_validator("status")
    @classmethod
    def _status(cls, v: str | None) -> str | None:
        if v is not None and v not in CONTENT_STATUSES:
            raise ValueError(f"Status must be one of {sorted(CONTENT_STATUSES)}")
        return v


class ContentBriefOut(ContentBriefBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime


class ContentBriefList(BaseModel):
    total: int
    items: list[ContentBriefOut]

"""Content Asset Suite — campaign-centric content workspace (Phase 1).

A `ContentAsset` is one campaign owned by a team member (the "member"), holding
the campaign meta plus Section A — the 4 Approved Input Files, each linkable to a
Google Drive folder / uploaded file / Notion page. Stored flexibly (JSON for the
input files) so slots/sources can evolve without a migration.

This is the replacement for the older Campaign + Content DB modules; those stay
in place until this suite is fully wired.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import DateTime, Integer, String, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base

ASSET_STATUSES = {"draft", "active", "paused", "completed"}
INPUT_SOURCES = {"google_drive", "uploaded", "notion", "none"}

# The 4 fixed Approved Input File slots (Section A).
DEFAULT_INPUT_FILES: list[dict] = [
    {"n": "01", "key": "product_info", "title": "Product Information", "synced": "Product_Info", "source": "google_drive", "drive_url": "", "thumb": "", "linked": False},
    {"n": "02", "key": "content_direction", "title": "Content Direction", "synced": "Content_Dir", "source": "google_drive", "drive_url": "", "thumb": "", "linked": False},
    {"n": "03", "key": "ci_design", "title": "CI Design Guidelines", "synced": "CI_Design", "source": "uploaded", "drive_url": "", "thumb": "", "linked": False},
    {"n": "04", "key": "content_category", "title": "Content Category Map", "synced": "Cat_Map", "source": "notion", "drive_url": "", "thumb": "", "linked": False},
]


class ContentAsset(Base):
    __tablename__ = "content_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # The member who owns this campaign (Firebase/Google identity later).
    owner_email: Mapped[str] = mapped_column(String(160), default="", index=True)
    owner_name: Mapped[str] = mapped_column(String(160), default="")

    client_name: Mapped[str] = mapped_column(String(160), default="", index=True)
    campaign_name: Mapped[str] = mapped_column(String(200), index=True)
    # Grouping + lead (loose references to Brand / Member; admins can edit freely).
    brand_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    # Lead(s) responsible for the campaign. `responsible_member_id` is kept as the
    # primary lead for back-compat; `responsible_member_ids` holds the full set so
    # a campaign can have several people responsible.
    responsible_member_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    responsible_member_ids: Mapped[list] = mapped_column(JSON, default=list)
    period_start: Mapped[str] = mapped_column(String(40), default="")
    period_end: Mapped[str] = mapped_column(String(40), default="")
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    tags: Mapped[str] = mapped_column(String(255), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    stakeholders: Mapped[str] = mapped_column(Text, default="")

    # Campaign-level Drive folder (stores JSON + media for this campaign).
    drive_folder_url: Mapped[str] = mapped_column(Text, default="")
    # Section A — the 4 approved input files (see DEFAULT_INPUT_FILES).
    input_files: Mapped[list] = mapped_column(JSON, default=lambda: [dict(f) for f in DEFAULT_INPUT_FILES])
    # Merged from the legacy Campaign module: creators assigned to this campaign.
    influencer_ids: Mapped[list] = mapped_column(JSON, default=list)
    # Section B — per-KOL campaign rows (each pulled from the influencer directory)
    # + the campaign's selectable Scope-of-Work options. Flexible JSON so the row
    # shape can evolve without a migration. See docs for the field contract.
    kols: Mapped[list] = mapped_column(JSON, default=list)
    sow_options: Mapped[list] = mapped_column(JSON, default=list)
    # Per-campaign access control — User ids granted access (managers edit /
    # viewers read). Set by admins only; admins always have access regardless.
    assigned_user_ids: Mapped[list] = mapped_column(JSON, default=list)
    # Which budget figures are shown to the customer. Keys: rate, gen_code_price,
    # boosting_cost, total. A missing/true key = shown; false = hidden from
    # viewers (admins/managers always see them, with an eye indicator).
    budget_show: Mapped[dict] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------- schemas ----------

class ContentAssetBase(BaseModel):
    owner_email: str = ""
    owner_name: str = ""
    client_name: str = ""
    campaign_name: str = Field(..., min_length=1, max_length=200)
    brand_id: int | None = None
    responsible_member_id: int | None = None
    responsible_member_ids: list[int] = Field(default_factory=list)
    period_start: str = ""
    period_end: str = ""
    status: str = "draft"
    tags: str = ""
    description: str = ""
    stakeholders: str = ""
    drive_folder_url: str = ""
    input_files: list[dict[str, Any]] | None = None
    influencer_ids: list[int] = Field(default_factory=list)
    assigned_user_ids: list[int] = Field(default_factory=list)
    budget_show: dict[str, bool] = Field(default_factory=dict)
    kols: list[dict[str, Any]] | None = None
    sow_options: list[str] | None = None

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        if v not in ASSET_STATUSES:
            raise ValueError(f"Status must be one of {sorted(ASSET_STATUSES)}")
        return v


class ContentAssetCreate(ContentAssetBase):
    pass


class ContentAssetUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    owner_email: str | None = None
    owner_name: str | None = None
    client_name: str | None = None
    campaign_name: str | None = Field(None, min_length=1, max_length=200)
    brand_id: int | None = None
    responsible_member_id: int | None = None
    responsible_member_ids: list[int] | None = None
    period_start: str | None = None
    period_end: str | None = None
    status: str | None = None
    tags: str | None = None
    description: str | None = None
    stakeholders: str | None = None
    drive_folder_url: str | None = None
    input_files: list[dict[str, Any]] | None = None
    influencer_ids: list[int] | None = None
    assigned_user_ids: list[int] | None = None
    budget_show: dict[str, bool] | None = None
    kols: list[dict[str, Any]] | None = None
    sow_options: list[str] | None = None

    @field_validator("status")
    @classmethod
    def _status(cls, v: str | None) -> str | None:
        if v is not None and v not in ASSET_STATUSES:
            raise ValueError(f"Status must be one of {sorted(ASSET_STATUSES)}")
        return v


class ContentAssetOut(ContentAssetBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    input_files: list[dict[str, Any]] = Field(default_factory=list)
    kols: list[dict[str, Any]] = Field(default_factory=list)
    sow_options: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ContentAssetList(BaseModel):
    total: int
    items: list[ContentAssetOut]

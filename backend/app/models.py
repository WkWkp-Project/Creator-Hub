"""ORM models.

The Influencer model captures everything the dashboard renders:
identity, audience metrics, the four-part fee breakdown
(base / code-gen / management / agency), suitability scores,
scope of work and past campaign history.
"""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, JSON, text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Influencer(Base):
    __tablename__ = "influencers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # --- Identity / profile ---
    name: Mapped[str] = mapped_column(String(160), index=True)
    handle: Mapped[str] = mapped_column(String(120), default="", index=True)
    avatar_url: Mapped[str] = mapped_column(Text, default="")
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bio: Mapped[str] = mapped_column(Text, default="")           # ประวัติคร่าวๆ
    location: Mapped[str] = mapped_column(String(120), default="")
    active_since: Mapped[str] = mapped_column(String(20), default="")

    niche: Mapped[str] = mapped_column(String(80), default="", index=True)
    platform: Mapped[str] = mapped_column(String(80), default="", index=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)

    # Audience tier (Nano / Micro / Mega) — auto-derived from `followers` when
    # not set explicitly. See services/tiers.py for thresholds.
    tier: Mapped[str] = mapped_column(String(20), default="", index=True)

    # Social profile links keyed by platform, rendered as clickable icons:
    # {"instagram": "https://instagram.com/...", "tiktok": "...", "youtube": "...",
    #  "facebook": "...", "twitter": "...", "line": "...", "website": "..."}
    social_links: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{}'"))

    # --- Audience metrics ---
    followers: Mapped[int] = mapped_column(Integer, default=0)        # total reach
    engagement_rate: Mapped[float] = mapped_column(Float, default=0.0)  # ER %
    growth_30d: Mapped[float] = mapped_column(Float, default=0.0)       # % 30d

    # Per-platform breakdown: [{"platform": "YouTube", "metric": "Subscribers", "value": "850K"}]
    platforms: Mapped[list] = mapped_column(JSON, default=list, server_default=text("'[]'"))

    # --- Fee breakdown (the four costs the brief asks for) ---
    base_rate: Mapped[float] = mapped_column(Float, default=0.0)        # ค่าตัว
    code_gen_fee: Mapped[float] = mapped_column(Float, default=0.0)     # ค่าเจนโค้ด
    management_fee: Mapped[float] = mapped_column(Float, default=0.0)   # ค่าเมเนจฟี
    agency_fee_pct: Mapped[float] = mapped_column(Float, default=0.0)   # ค่าเอเจนฟี (% ของยอดรวมย่อย)
    currency: Mapped[str] = mapped_column(String(8), default="THB")

    # --- Suitability / campaign fit (0-100) ---
    brand_safety: Mapped[float] = mapped_column(Float, default=0.0)
    audience_alignment: Mapped[float] = mapped_column(Float, default=0.0)
    content_quality: Mapped[float] = mapped_column(Float, default=0.0)
    reliability: Mapped[float] = mapped_column(Float, default=0.0)
    fit_note: Mapped[str] = mapped_column(Text, default="")

    # Scope of work: [{"title": "1x YouTube Video", "detail": "8-12 min integrated"}]
    scope_of_work: Mapped[list] = mapped_column(JSON, default=list, server_default=text("'[]'"))

    # Past campaigns: [{"brand": "Beauty Co", "campaign": "Launch promo", "views": "200k", "ctr": "15%"}]
    past_campaigns: Mapped[list] = mapped_column(JSON, default=list, server_default=text("'[]'"))

    notes: Mapped[str] = mapped_column(Text, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    @property
    def subtotal_fee(self) -> float:
        """Sum of the fixed fees that the agency percentage is applied to."""
        return round(
            (self.base_rate or 0)
            + (self.code_gen_fee or 0)
            + (self.management_fee or 0),
            2,
        )

    @property
    def agency_amount(self) -> float:
        """Agency fee expressed as an absolute amount (subtotal x percentage)."""
        return round(self.subtotal_fee * (self.agency_fee_pct or 0) / 100, 2)

    @property
    def total_fee(self) -> float:
        return round(self.subtotal_fee + self.agency_amount, 2)


class User(Base):
    """Application user. role is 'admin' (full control) or 'viewer' (read-only)."""
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    # Email links a login account to its directory Member (kept in sync by email).
    email: Mapped[str] = mapped_column(String(160), default="", index=True)
    full_name: Mapped[str] = mapped_column(String(160), default="")
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(20), default="viewer", index=True)
    # Directory fields (folded in from the old Members page): the org/company this
    # person belongs to, their job position, and a free-text note.
    organization: Mapped[str] = mapped_column(String(160), default="")
    position: Mapped[str] = mapped_column(String(120), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Campaign(Base):
    """A marketing campaign with assigned influencers and a budget."""
    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    brand: Mapped[str] = mapped_column(String(160), default="", index=True)
    # planning | active | completed | cancelled
    status: Mapped[str] = mapped_column(String(20), default="planning", index=True)
    objective: Mapped[str] = mapped_column(Text, default="")
    start_date: Mapped[str] = mapped_column(String(20), default="")
    end_date: Mapped[str] = mapped_column(String(20), default="")
    budget: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="THB")
    # IDs of assigned influencers (kept simple as a JSON list).
    influencer_ids: Mapped[list] = mapped_column(JSON, default=list, server_default=text("'[]'"))
    notes: Mapped[str] = mapped_column(Text, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ChangeLog(Base):
    """Server-side audit trail of campaign (ContentAsset) changes — who did what,
    when. Read-only history (auto-created table; no migration needed)."""
    __tablename__ = "change_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    asset_id: Mapped[int] = mapped_column(Integer, index=True)
    actor: Mapped[str] = mapped_column(String(160), default="")
    action: Mapped[str] = mapped_column(String(20), default="updated")  # created/updated/deleted
    summary: Mapped[str] = mapped_column(String(400), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

"""ORM models.

The Influencer model captures everything the dashboard renders:
identity, audience metrics, the four-part fee breakdown
(base / code-gen / management / agency), suitability scores,
scope of work and past campaign history.
"""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, LargeBinary, String, Text, JSON, text, false
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
    # Incremented to revoke all of this user's outstanding tokens (logout /
    # password change / admin force-logout). A token is valid only if its `tv`
    # claim matches this.
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    # Directory fields (folded in from the old Members page): the org/company this
    # person belongs to, their job position, and a free-text note.
    organization: Mapped[str] = mapped_column(String(160), default="")
    position: Mapped[str] = mapped_column(String(120), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    # Per-user grant to view the influencer Directory. Admins always can; a
    # non-admin (manager/viewer) sees the Directory only when this is true.
    directory_access: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AppSetting(Base):
    """Tiny key→JSON store for global app settings (e.g. the Directory field
    allowlist applied to all non-admin viewers)."""
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, default=dict)


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
    # What was touched: entity ("campaign" / "user" / "member" / "brand" / "auth"
    # / "import" / "backup") and its id (asset_id is the generic entity id).
    entity: Mapped[str] = mapped_column(String(20), default="campaign", server_default=text("'campaign'"), index=True)
    asset_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    # Who did it — display name plus the immutable user id (non-repudiation;
    # renaming the user can't rewrite who acted).
    actor: Mapped[str] = mapped_column(String(160), default="")
    actor_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    action: Mapped[str] = mapped_column(String(20), default="updated")  # created/updated/deleted/login/logout/...
    summary: Mapped[str] = mapped_column(String(400), default="")
    # Optional before/after for sensitive changes, e.g. {"role": {"from","to"}}.
    detail: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class UploadedFile(Base):
    """User-uploaded media (avatars + campaign media) stored IN the database so it
    survives on hosts with an ephemeral filesystem (e.g. Render), where files on
    local disk are wiped on every restart/redeploy. `path` mirrors the public URL
    tail ("campaigns/<hash>.png") so the served URL is unchanged."""
    __tablename__ = "uploaded_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    path: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    content: Mapped[bytes] = mapped_column(LargeBinary)
    content_type: Mapped[str] = mapped_column(String(100), default="application/octet-stream")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

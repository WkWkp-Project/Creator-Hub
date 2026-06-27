"""Pydantic schemas (request validation + response serialization)."""
from datetime import datetime
from typing import Any
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .services.tiers import normalize_tier


def sanitize_social_links(links: dict[str, str] | None) -> dict[str, str]:
    """Keep only explicit HTTP(S) URLs for clickable social profile links."""
    clean: dict[str, str] = {}
    for key, raw_url in (links or {}).items():
        url = str(raw_url or "").strip()
        if not url:
            continue
        parsed = urlparse(url)
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Social links must be full http(s) URLs")
        clean[str(key).strip()] = url
    return clean


def sanitize_avatar_url(value: str | None) -> str:
    """Allow uploaded avatar paths and explicit HTTP(S) image URLs."""
    url = str(value or "").strip()
    if not url:
        return ""
    if url.startswith("/uploads/avatars/"):
        return url
    parsed = urlparse(url)
    if parsed.scheme.lower() in {"http", "https"} and parsed.netloc:
        return url
    raise ValueError("Avatar must be an uploaded image or a full http(s) URL")


def sanitize_work_url(value: str | None) -> str:
    url = str(value or "").strip()
    if not url:
        return ""
    parsed = urlparse(url)
    if parsed.scheme.lower() in {"http", "https"} and parsed.netloc:
        return url
    raise ValueError("Work links must be full http(s) URLs")


def sanitize_campaign_media_url(value: str | None) -> str:
    url = str(value or "").strip()
    if not url:
        return ""
    if url.startswith("/uploads/campaigns/"):
        return url
    parsed = urlparse(url)
    if parsed.scheme.lower() in {"http", "https"} and parsed.netloc:
        return url
    raise ValueError("Campaign media must be uploaded media or a full http(s) URL")


def sanitize_past_campaigns(campaigns: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    clean: list[dict[str, Any]] = []
    for item in campaigns or []:
        campaign = dict(item)
        if "work_url" in campaign:
            campaign["work_url"] = sanitize_work_url(campaign.get("work_url"))
        if "media_url" in campaign:
            campaign["media_url"] = sanitize_campaign_media_url(campaign.get("media_url"))
        media_type = str(campaign.get("media_type") or "").strip().lower()
        if media_type and media_type not in {"image", "video"}:
            raise ValueError("Campaign media type must be image or video")
        if media_type:
            campaign["media_type"] = media_type
        clean.append(campaign)
    return clean


def normalize_tier_value(value: str | None) -> str:
    """Empty string passes through (auto-derive later). A known tier is
    canonicalised (Nano / Micro / Mega); any other non-empty text is kept as a
    custom, hand-entered tier label (trimmed to the column width)."""
    raw = str(value or "").strip()
    if not raw:
        return ""
    return normalize_tier(raw) or raw[:20]


class InfluencerBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    handle: str = ""
    avatar_url: str = ""
    age: int | None = None
    bio: str = ""
    location: str = ""
    active_since: str = ""

    niche: str = ""
    platform: str = ""
    verified: bool = False
    tier: str = ""                       # Nano / Micro / Mega ("" -> auto from followers)
    social_links: dict[str, str] = Field(default_factory=dict)

    followers: int = 0
    engagement_rate: float = 0.0
    growth_30d: float = 0.0
    platforms: list[dict[str, Any]] = Field(default_factory=list)

    base_rate: float = 0.0
    code_gen_fee: float = 0.0
    management_fee: float = 0.0
    agency_fee_pct: float = 0.0          # ค่าเอเจนฟี เป็นเปอร์เซ็นต์
    currency: str = "THB"

    brand_safety: float = 0.0
    audience_alignment: float = 0.0
    content_quality: float = 0.0
    reliability: float = 0.0
    fit_note: str = ""

    scope_of_work: list[dict[str, Any]] = Field(default_factory=list)
    past_campaigns: list[dict[str, Any]] = Field(default_factory=list)
    notes: str = ""


class InfluencerCreate(InfluencerBase):
    @field_validator("avatar_url")
    @classmethod
    def validate_avatar_url(cls, value: str) -> str:
        return sanitize_avatar_url(value)

    @field_validator("social_links")
    @classmethod
    def validate_social_links(cls, value: dict[str, str]) -> dict[str, str]:
        return sanitize_social_links(value)

    @field_validator("past_campaigns")
    @classmethod
    def validate_past_campaigns(cls, value: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return sanitize_past_campaigns(value)

    @field_validator("tier")
    @classmethod
    def validate_tier(cls, value: str) -> str:
        return normalize_tier_value(value)


class InfluencerUpdate(BaseModel):
    """All optional — supports partial PATCH-style updates via PUT."""
    model_config = ConfigDict(extra="ignore")

    name: str | None = Field(None, min_length=1, max_length=160)
    handle: str | None = None
    avatar_url: str | None = None
    age: int | None = None
    bio: str | None = None
    location: str | None = None
    active_since: str | None = None
    niche: str | None = None
    platform: str | None = None
    verified: bool | None = None
    tier: str | None = None
    social_links: dict[str, str] | None = None
    followers: int | None = None
    engagement_rate: float | None = None
    growth_30d: float | None = None
    platforms: list[dict[str, Any]] | None = None
    base_rate: float | None = None
    code_gen_fee: float | None = None
    management_fee: float | None = None
    agency_fee_pct: float | None = None
    currency: str | None = None
    brand_safety: float | None = None
    audience_alignment: float | None = None
    content_quality: float | None = None
    reliability: float | None = None
    fit_note: str | None = None
    scope_of_work: list[dict[str, Any]] | None = None
    past_campaigns: list[dict[str, Any]] | None = None
    notes: str | None = None

    @field_validator("social_links")
    @classmethod
    def validate_social_links(cls, value: dict[str, str] | None) -> dict[str, str] | None:
        return None if value is None else sanitize_social_links(value)

    @field_validator("avatar_url")
    @classmethod
    def validate_avatar_url(cls, value: str | None) -> str | None:
        return None if value is None else sanitize_avatar_url(value)

    @field_validator("past_campaigns")
    @classmethod
    def validate_past_campaigns(cls, value: list[dict[str, Any]] | None) -> list[dict[str, Any]] | None:
        return None if value is None else sanitize_past_campaigns(value)

    @field_validator("tier")
    @classmethod
    def validate_tier(cls, value: str | None) -> str | None:
        return None if value is None else normalize_tier_value(value)


class InfluencerOut(InfluencerBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subtotal_fee: float
    agency_amount: float
    total_fee: float
    created_at: datetime
    updated_at: datetime


class InfluencerList(BaseModel):
    total: int
    items: list[InfluencerOut]


# ---------- Import / auto-matching schemas ----------

class ColumnSuggestion(BaseModel):
    file_column: str
    system_field: str | None          # matched system field (None = unmapped)
    confidence: float                 # 0-100
    status: str                       # "matched" | "review" | "unmapped"
    sample: list[str] = Field(default_factory=list)


class ImportPreview(BaseModel):
    upload_id: str
    filename: str
    row_count: int
    detected_columns: list[str]
    suggestions: list[ColumnSuggestion]
    system_fields: list[str]
    mapped_count: int


class ColumnMapping(BaseModel):
    file_column: str
    system_field: str | None


class ImportCommit(BaseModel):
    upload_id: str
    mappings: list[ColumnMapping]
    update_existing: bool = True       # upsert on handle/name match


class ImportResult(BaseModel):
    created: int
    updated: int
    skipped: int
    errors: list[str] = Field(default_factory=list)


# ---------- Auth / users ----------

# admin = full control; manager = edit only campaigns assigned to them;
# viewer = read-only, and only campaigns assigned to them.
ROLES = {"admin", "manager", "viewer"}


class LoginRequest(BaseModel):
    username: str
    password: str


class GoogleLoginRequest(BaseModel):
    credential: str   # Google ID token (JWT) from Google Identity Services


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    email: str = ""
    full_name: str = ""
    role: str
    organization: str = ""
    position: str = ""
    note: str = ""


class LoginResponse(BaseModel):
    token: str
    user: UserOut


# Reject obviously-weak / default passwords (length is enforced separately).
_COMMON_PASSWORDS = {
    "password", "password1", "passw0rd", "12345678", "123456789", "1234567890",
    "qwerty123", "admin123", "administrator", "letmein1", "welcome1", "iloveyou",
    "viewer123", "changeme", "secret12", "abc12345", "00000000", "11111111",
    "creatorhub", "wakuwaku", "qwertyui",
}


def validate_password_strength(pw: str) -> str:
    if len(pw) < 8:
        raise ValueError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร")
    if pw.lower() in _COMMON_PASSWORDS:
        raise ValueError("รหัสผ่านนี้ง่ายเกินไป (อยู่ในรายการที่พบบ่อย) — กรุณาตั้งใหม่")
    if len(set(pw)) == 1:
        raise ValueError("รหัสผ่านต้องไม่ใช่ตัวอักษรเดียวซ้ำกัน")
    return pw


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=80)
    password: str = Field(..., min_length=8, max_length=128)
    email: str = ""
    full_name: str = ""
    role: str = "viewer"
    organization: str = ""
    position: str = ""
    note: str = ""

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        if value not in ROLES:
            raise ValueError("Role must be 'admin', 'manager' or 'viewer'")
        return value

    @field_validator("password")
    @classmethod
    def _password(cls, value: str) -> str:
        return validate_password_strength(value)


class PasswordChange(BaseModel):
    current_password: str | None = None     # required when changing your own
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _new_password(cls, value: str) -> str:
        return validate_password_strength(value)


class UserUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    role: str | None = None
    organization: str | None = None
    position: str | None = None
    note: str | None = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str | None) -> str | None:
        if value is not None and value not in ROLES:
            raise ValueError("Role must be 'admin', 'manager' or 'viewer'")
        return value


# ---------- Campaigns ----------

CAMPAIGN_STATUSES = {"planning", "active", "completed", "cancelled"}


class CampaignBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    brand: str = ""
    status: str = "planning"
    objective: str = ""
    start_date: str = ""
    end_date: str = ""
    budget: float = 0.0
    currency: str = "THB"
    influencer_ids: list[int] = Field(default_factory=list)
    notes: str = ""

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in CAMPAIGN_STATUSES:
            raise ValueError(f"Status must be one of {sorted(CAMPAIGN_STATUSES)}")
        return value


class CampaignCreate(CampaignBase):
    pass


class CampaignUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str | None = Field(None, min_length=1, max_length=200)
    brand: str | None = None
    status: str | None = None
    objective: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    budget: float | None = None
    currency: str | None = None
    influencer_ids: list[int] | None = None
    notes: str | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str | None) -> str | None:
        if value is not None and value not in CAMPAIGN_STATUSES:
            raise ValueError(f"Status must be one of {sorted(CAMPAIGN_STATUSES)}")
        return value


class CampaignOut(CampaignBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime


class CampaignList(BaseModel):
    total: int
    items: list[CampaignOut]

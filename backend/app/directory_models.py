"""Members + Brands — lightweight directory entities (separate module).

`Member` is the team/people directory (admins + customers); kept simple (no
photo, minimal fields). `Brand` groups campaigns. Auth/Firebase will later map a
Google identity onto a Member, but for now these are plain managed lists.
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base

MEMBER_ROLES = {"admin", "customer"}


class Member(Base):
    __tablename__ = "members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    email: Mapped[str] = mapped_column(String(160), default="", index=True)
    role: Mapped[str] = mapped_column(String(20), default="customer", index=True)
    organization: Mapped[str] = mapped_column(String(160), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Brand(Base):
    __tablename__ = "brands"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ---------- schemas ----------

class MemberBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    email: str = ""
    role: str = "customer"
    organization: str = ""
    note: str = ""

    @field_validator("role")
    @classmethod
    def _role(cls, v: str) -> str:
        if v not in MEMBER_ROLES:
            raise ValueError("Role must be 'admin' or 'customer'")
        return v


class MemberCreate(MemberBase):
    pass


class MemberUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str | None = Field(None, min_length=1, max_length=160)
    email: str | None = None
    role: str | None = None
    organization: str | None = None
    note: str | None = None

    @field_validator("role")
    @classmethod
    def _role(cls, v: str | None) -> str | None:
        if v is not None and v not in MEMBER_ROLES:
            raise ValueError("Role must be 'admin' or 'customer'")
        return v


class MemberOut(MemberBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


class BrandBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    note: str = ""


class BrandCreate(BrandBase):
    pass


class BrandUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str | None = Field(None, min_length=1, max_length=160)
    note: str | None = None


class BrandOut(BrandBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime

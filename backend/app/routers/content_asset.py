"""Content Asset Suite endpoints — per-campaign access control.

Access model:
  - admin   : sees & manages every campaign; the only role that can create,
              delete, and assign access.
  - manager : sees & edits only campaigns assigned to them (assigned_user_ids).
  - viewer  : sees (read-only) only campaigns assigned to them.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import models
from ..content_asset_models import (
    DEFAULT_INPUT_FILES,
    ContentAsset,
    ContentAssetCreate,
    ContentAssetList,
    ContentAssetOut,
    ContentAssetUpdate,
)
from ..database import get_db
from ..deps import get_current_user, require_admin
from ..directory_models import Brand

router = APIRouter(prefix="/api/assets", tags=["content-asset"])


def _enforce_company(db: Session, obj: ContentAsset) -> None:
    """A campaign's Company is governed by its Brand: if the campaign is under a
    brand that has a company, force client_name to that company so Company →
    Brand → Campaign stays consistent."""
    if obj.brand_id:
        br = db.get(Brand, obj.brand_id)
        if br and br.company:
            obj.client_name = br.company

# Governance fields only an admin may change (a manager editing a campaign must
# not be able to grant access or reassign ownership).
ADMIN_ONLY_FIELDS = {"assigned_user_ids", "owner_email", "owner_name", "responsible_member_id", "responsible_member_ids"}


def _can_read(user: models.User, asset: ContentAsset) -> bool:
    return user.role == "admin" or user.id in (asset.assigned_user_ids or [])


def _can_edit(user: models.User, asset: ContentAsset) -> bool:
    return user.role == "admin" or (user.role == "manager" and user.id in (asset.assigned_user_ids or []))


_BUDGET_KEYS = ("rate", "gen_code_price", "boosting_cost")


def _redact_budget(asset: ContentAsset, user: models.User) -> None:
    """Enforce budget_show server-side: blank the budget figures a campaign hid
    from the customer (viewer). Mutates the in-memory object only — this runs in
    read paths that never commit, so it does not persist."""
    if user.role != "viewer":
        return
    bshow = asset.budget_show or {}
    hidden = [k for k in _BUDGET_KEYS if bshow.get(k) is False]
    if hidden:
        asset.kols = [{**k, **{f: "" for f in hidden}} for k in (asset.kols or [])]


@router.get("", response_model=ContentAssetList)
def list_assets(
    search: str | None = None,
    owner_email: str | None = None,
    status: str | None = None,
    skip: int = 0,
    limit: int = Query(200, le=500),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(ContentAsset)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(or_(ContentAsset.campaign_name.ilike(like), ContentAsset.client_name.ilike(like)))
    if owner_email:
        stmt = stmt.where(ContentAsset.owner_email == owner_email)
    if status and status.lower() not in {"all", ""}:
        stmt = stmt.where(ContentAsset.status == status.lower())
    stmt = stmt.order_by(ContentAsset.updated_at.desc())
    rows = db.execute(stmt).scalars().all()
    # Non-admins only see the campaigns assigned to them (visibility is scoped).
    if user.role != "admin":
        rows = [a for a in rows if user.id in (a.assigned_user_ids or [])]
    total = len(rows)
    items = rows[skip: skip + limit]
    for it in items:
        _redact_budget(it, user)
    return {"total": total, "items": items}


@router.get("/{asset_id}", response_model=ContentAssetOut)
def get_asset(asset_id: int, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    obj = db.get(ContentAsset, asset_id)
    if not obj or not _can_read(user, obj):
        raise HTTPException(404, "Content asset not found")   # hide existence from unauthorised users
    _redact_budget(obj, user)
    return obj


@router.post("", response_model=ContentAssetOut, status_code=201)
def create_asset(data: ContentAssetCreate, _: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    values = data.model_dump()
    if not values.get("input_files"):
        values["input_files"] = [dict(f) for f in DEFAULT_INPUT_FILES]
    # JSON list columns must never be None (response model requires lists).
    for k in ("kols", "sow_options", "influencer_ids", "assigned_user_ids", "responsible_member_ids"):
        if values.get(k) is None:
            values[k] = []
    if values.get("budget_show") is None:
        values["budget_show"] = {}
    obj = ContentAsset(**values)
    _enforce_company(db, obj)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{asset_id}", response_model=ContentAssetOut)
def update_asset(
    asset_id: int,
    data: ContentAssetUpdate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    obj = db.get(ContentAsset, asset_id)
    if not obj or not _can_read(user, obj):
        raise HTTPException(404, "Content asset not found")
    if not _can_edit(user, obj):
        raise HTTPException(403, "คุณมีสิทธิ์ดูแคมเปญนี้เท่านั้น (แก้ไขไม่ได้)")
    changes = data.model_dump(exclude_unset=True)
    if user.role != "admin":
        changes = {k: v for k, v in changes.items() if k not in ADMIN_ONLY_FIELDS}
    # JSON list/dict columns must never be set to None (the response model requires
    # them) — an explicit null in the body coerces back to the empty container.
    for k in ("kols", "sow_options", "influencer_ids", "assigned_user_ids", "responsible_member_ids", "input_files"):
        if k in changes and changes[k] is None:
            changes[k] = []
    if "budget_show" in changes and changes["budget_show"] is None:
        changes["budget_show"] = {}
    for key, value in changes.items():
        setattr(obj, key, value)
    _enforce_company(db, obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{asset_id}/drive-links", response_model=ContentAssetOut)
def update_drive_links(
    asset_id: int,
    links: dict[str, str],
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Set the Drive folder URL per input-file key; marks linked when a URL is present."""
    obj = db.get(ContentAsset, asset_id)
    if not obj or not _can_read(user, obj):
        raise HTTPException(404, "Content asset not found")
    if not _can_edit(user, obj):
        raise HTTPException(403, "คุณมีสิทธิ์ดูแคมเปญนี้เท่านั้น (แก้ไขไม่ได้)")
    files = [dict(f) for f in (obj.input_files or [])]
    for f in files:
        if f.get("key") in links:
            url = (links[f["key"]] or "").strip()
            f["drive_url"] = url
            f["linked"] = bool(url)
    obj.input_files = files
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{asset_id}", status_code=204)
def delete_asset(asset_id: int, _: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    obj = db.get(ContentAsset, asset_id)
    if not obj:
        raise HTTPException(404, "Content asset not found")
    db.delete(obj)
    db.commit()

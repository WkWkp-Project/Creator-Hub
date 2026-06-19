"""Content Asset Suite endpoints. Reads require login; writes require admin."""
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

router = APIRouter(prefix="/api/assets", tags=["content-asset"])


@router.get("", response_model=ContentAssetList)
def list_assets(
    search: str | None = None,
    owner_email: str | None = None,
    status: str | None = None,
    skip: int = 0,
    limit: int = Query(200, le=500),
    _: models.User = Depends(get_current_user),
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
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(ContentAsset.updated_at.desc())
    items = db.execute(stmt.offset(skip).limit(limit)).scalars().all()
    return {"total": total, "items": items}


@router.get("/{asset_id}", response_model=ContentAssetOut)
def get_asset(asset_id: int, _: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    obj = db.get(ContentAsset, asset_id)
    if not obj:
        raise HTTPException(404, "Content asset not found")
    return obj


@router.post("", response_model=ContentAssetOut, status_code=201)
def create_asset(data: ContentAssetCreate, _: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    values = data.model_dump()
    if not values.get("input_files"):
        values["input_files"] = [dict(f) for f in DEFAULT_INPUT_FILES]
    # JSON list columns must never be None (response model requires lists).
    for k in ("kols", "sow_options", "influencer_ids"):
        if values.get(k) is None:
            values[k] = []
    obj = ContentAsset(**values)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{asset_id}", response_model=ContentAssetOut)
def update_asset(
    asset_id: int,
    data: ContentAssetUpdate,
    _: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    obj = db.get(ContentAsset, asset_id)
    if not obj:
        raise HTTPException(404, "Content asset not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{asset_id}/drive-links", response_model=ContentAssetOut)
def update_drive_links(
    asset_id: int,
    links: dict[str, str],
    _: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Set the Drive folder URL per input-file key; marks linked when a URL is present."""
    obj = db.get(ContentAsset, asset_id)
    if not obj:
        raise HTTPException(404, "Content asset not found")
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

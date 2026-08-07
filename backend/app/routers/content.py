"""Content DB endpoints (separate module). Reads require login; writes require admin."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import audit, models
from ..content_models import (
    ContentBrief,
    ContentBriefCreate,
    ContentBriefList,
    ContentBriefOut,
    ContentBriefUpdate,
)
from ..database import get_db
from ..deps import get_current_user, require_admin

router = APIRouter(prefix="/api/content", tags=["content"])


@router.get("", response_model=ContentBriefList)
def list_content(
    search: str | None = None,
    campaign_id: int | None = None,
    status: str | None = None,
    skip: int = 0,
    limit: int = Query(100, le=500),
    _: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(ContentBrief)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(or_(ContentBrief.title.ilike(like), ContentBrief.notes.ilike(like)))
    if campaign_id is not None:
        stmt = stmt.where(ContentBrief.campaign_id == campaign_id)
    if status and status.lower() not in {"all", "all statuses", ""}:
        stmt = stmt.where(ContentBrief.status == status.lower())
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(ContentBrief.updated_at.desc())
    items = db.execute(stmt.offset(skip).limit(limit)).scalars().all()
    return {"total": total, "items": items}


@router.get("/{brief_id}", response_model=ContentBriefOut)
def get_content(brief_id: int, _: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    obj = db.get(ContentBrief, brief_id)
    if not obj:
        raise HTTPException(404, "Content brief not found")
    return obj


@router.post("", response_model=ContentBriefOut, status_code=201)
def create_content(data: ContentBriefCreate, actor: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    obj = ContentBrief(**data.model_dump())
    db.add(obj)
    db.flush()
    audit.record(
        db,
        entity="content",
        entity_id=obj.id,
        user=actor,
        action="created",
        summary=f"Created content brief: {obj.title}",
    )
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{brief_id}", response_model=ContentBriefOut)
def update_content(
    brief_id: int,
    data: ContentBriefUpdate,
    actor: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    obj = db.get(ContentBrief, brief_id)
    if not obj:
        raise HTTPException(404, "Content brief not found")
    changes = data.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(obj, key, value)
    audit.record(
        db,
        entity="content",
        entity_id=obj.id,
        user=actor,
        action="updated",
        summary=f"Updated content brief: {obj.title}",
        detail={"fields": sorted(changes.keys())},
    )
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{brief_id}", status_code=204)
def delete_content(brief_id: int, actor: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    obj = db.get(ContentBrief, brief_id)
    if not obj:
        raise HTTPException(404, "Content brief not found")
    title = obj.title
    db.delete(obj)
    audit.record(
        db,
        entity="content",
        entity_id=brief_id,
        user=actor,
        action="deleted",
        summary=f"Deleted content brief: {title}",
    )
    db.commit()

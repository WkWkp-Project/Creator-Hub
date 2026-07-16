"""Campaign CRUD endpoints. Reads require login; writes require admin."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import audit, crud, models, schemas
from ..database import get_db
from ..deps import get_current_user, require_admin

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


@router.get("", response_model=schemas.CampaignList)
def list_campaigns(
    search: str | None = None,
    status: str | None = None,
    skip: int = 0,
    limit: int = Query(100, le=500),
    _: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    total, items = crud.list_campaigns(db, search=search, status=status, skip=skip, limit=limit)
    return {"total": total, "items": items}


@router.get("/{campaign_id}", response_model=schemas.CampaignOut)
def get_campaign(
    campaign_id: int,
    _: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    obj = crud.get_campaign(db, campaign_id)
    if not obj:
        raise HTTPException(404, "Campaign not found")
    return obj


@router.post("", response_model=schemas.CampaignOut, status_code=201)
def create_campaign(
    data: schemas.CampaignCreate,
    actor: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    obj = crud.create_campaign(db, data)
    audit.record(
        db,
        entity="legacy_campaign",
        entity_id=obj.id,
        user=actor,
        action="created",
        summary=f"Created legacy campaign: {obj.name}",
    )
    db.commit()
    return obj


@router.put("/{campaign_id}", response_model=schemas.CampaignOut)
def update_campaign(
    campaign_id: int,
    data: schemas.CampaignUpdate,
    actor: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    obj = crud.get_campaign(db, campaign_id)
    if not obj:
        raise HTTPException(404, "Campaign not found")
    changed_fields = sorted(data.model_dump(exclude_unset=True).keys())
    obj = crud.update_campaign(db, obj, data)
    audit.record(
        db,
        entity="legacy_campaign",
        entity_id=obj.id,
        user=actor,
        action="updated",
        summary=f"Updated legacy campaign: {obj.name}",
        detail={"fields": changed_fields},
    )
    db.commit()
    return obj


@router.delete("/{campaign_id}", status_code=204)
def delete_campaign(
    campaign_id: int,
    actor: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    obj = crud.get_campaign(db, campaign_id)
    if not obj:
        raise HTTPException(404, "Campaign not found")
    name = obj.name
    crud.delete_campaign(db, obj)
    audit.record(
        db,
        entity="legacy_campaign",
        entity_id=campaign_id,
        user=actor,
        action="deleted",
        summary=f"Deleted legacy campaign: {name}",
    )
    db.commit()

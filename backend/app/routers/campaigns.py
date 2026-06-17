"""Campaign CRUD endpoints. Reads require login; writes require admin."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import crud, models, schemas
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
    _: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return crud.create_campaign(db, data)


@router.put("/{campaign_id}", response_model=schemas.CampaignOut)
def update_campaign(
    campaign_id: int,
    data: schemas.CampaignUpdate,
    _: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    obj = crud.get_campaign(db, campaign_id)
    if not obj:
        raise HTTPException(404, "Campaign not found")
    return crud.update_campaign(db, obj, data)


@router.delete("/{campaign_id}", status_code=204)
def delete_campaign(
    campaign_id: int,
    _: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    obj = crud.get_campaign(db, campaign_id)
    if not obj:
        raise HTTPException(404, "Campaign not found")
    crud.delete_campaign(db, obj)

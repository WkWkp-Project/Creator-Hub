"""Database access helpers for influencers."""
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from . import models, schemas
from .services.tiers import tier_for_followers


def get(db: Session, influencer_id: int) -> models.Influencer | None:
    return db.get(models.Influencer, influencer_id)


def list_influencers(
    db: Session,
    *,
    search: str | None = None,
    platform: str | None = None,
    niche: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    verified: bool | None = None,
    tier: str | None = None,
    sort: str = "name",
    skip: int = 0,
    limit: int = 50,
) -> tuple[int, list[models.Influencer]]:
    stmt = select(models.Influencer)

    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            or_(
                models.Influencer.name.ilike(like),
                models.Influencer.handle.ilike(like),
                models.Influencer.niche.ilike(like),
            )
        )
    if platform and platform.lower() not in {"all platforms", "all", ""}:
        stmt = stmt.where(models.Influencer.platform.ilike(f"%{platform}%"))
    if niche and niche.lower() not in {"any niche", "any", ""}:
        stmt = stmt.where(models.Influencer.niche.ilike(f"%{niche}%"))
    if verified is not None:
        stmt = stmt.where(models.Influencer.verified == verified)
    if tier and tier.lower() not in {"all tiers", "all", ""}:
        stmt = stmt.where(models.Influencer.tier.ilike(tier))

    # Price filter works on the total fee.
    # subtotal = base + code-gen + management ; total = subtotal * (1 + agency%/100)
    subtotal = (
        models.Influencer.base_rate
        + models.Influencer.code_gen_fee
        + models.Influencer.management_fee
    )
    fee_total = subtotal * (1 + models.Influencer.agency_fee_pct / 100)
    if min_price is not None:
        stmt = stmt.where(fee_total >= min_price)
    if max_price is not None:
        stmt = stmt.where(fee_total <= max_price)

    sort_map = {
        "name": models.Influencer.name.asc(),
        "followers": models.Influencer.followers.desc(),
        "engagement": models.Influencer.engagement_rate.desc(),
        "price": fee_total.asc(),
        "price_desc": fee_total.desc(),
        "newest": models.Influencer.created_at.desc(),
    }
    # Count via a COUNT(*) subquery instead of materialising every row.
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0

    stmt = stmt.order_by(sort_map.get(sort, models.Influencer.name.asc()))
    items = db.execute(stmt.offset(skip).limit(limit)).scalars().all()
    return total, list(items)


def create(db: Session, data: schemas.InfluencerCreate) -> models.Influencer:
    values = data.model_dump()
    # Auto-derive the tier from followers when not explicitly chosen.
    if not values.get("tier"):
        values["tier"] = tier_for_followers(values.get("followers"))
    obj = models.Influencer(**values)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update(db: Session, obj: models.Influencer, data: schemas.InfluencerUpdate) -> models.Influencer:
    changes = data.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(obj, key, value)
    # Re-derive tier when followers changed but no explicit tier was supplied,
    # or when tier was cleared (sent as empty string = "auto").
    if not obj.tier or ("followers" in changes and not changes.get("tier")):
        obj.tier = tier_for_followers(obj.followers)
    db.commit()
    db.refresh(obj)
    return obj


def delete(db: Session, obj: models.Influencer) -> None:
    db.delete(obj)
    db.commit()


# ---------- campaigns ----------

def list_campaigns(
    db: Session, *, search: str | None = None, status: str | None = None,
    skip: int = 0, limit: int = 100,
) -> tuple[int, list[models.Campaign]]:
    stmt = select(models.Campaign)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            or_(models.Campaign.name.ilike(like), models.Campaign.brand.ilike(like))
        )
    if status and status.lower() not in {"all", "all statuses", ""}:
        stmt = stmt.where(models.Campaign.status == status.lower())
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(models.Campaign.created_at.desc())
    items = db.execute(stmt.offset(skip).limit(limit)).scalars().all()
    return total, list(items)


def get_campaign(db: Session, campaign_id: int) -> models.Campaign | None:
    return db.get(models.Campaign, campaign_id)


def create_campaign(db: Session, data: schemas.CampaignCreate) -> models.Campaign:
    obj = models.Campaign(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_campaign(db: Session, obj: models.Campaign, data: schemas.CampaignUpdate) -> models.Campaign:
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    db.commit()
    db.refresh(obj)
    return obj


def delete_campaign(db: Session, obj: models.Campaign) -> None:
    db.delete(obj)
    db.commit()


def find_match(db: Session, name: str, handle: str) -> models.Influencer | None:
    """Used by the importer to upsert by handle (preferred) or name."""
    stmt = select(models.Influencer)
    if handle:
        found = db.execute(stmt.where(models.Influencer.handle.ilike(handle))).scalars().first()
        if found:
            return found
    if name:
        return db.execute(stmt.where(models.Influencer.name.ilike(name))).scalars().first()
    return None

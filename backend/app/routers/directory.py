"""Members + Brands endpoints. Reads require login; writes require admin."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models
from ..content_asset_models import ContentAsset
from ..database import get_db
from ..deps import get_current_user, require_admin
from ..directory_models import (
    Brand, BrandCreate, BrandOut, BrandUpdate,
    Member, MemberCreate, MemberOut, MemberUpdate,
    user_role_for,
)

router = APIRouter(prefix="/api", tags=["directory"])


def _sync_user_for_member(db: Session, member: Member) -> None:
    """Ensure this directory person also has a login account (matched by email),
    and keep its role consistent (admin↔admin, manager↔manager, customer↔viewer).
    The login is created without a usable password — the person signs in with
    Google, or an admin sets a password later."""
    e = (member.email or "").strip().lower()
    if "@" not in e or len(e) > 80:   # need a usable email that fits the username column
        return
    role = user_role_for(member.role)
    u = db.query(models.User).filter(
        (func.lower(models.User.email) == e) | (func.lower(models.User.username) == e)
    ).first()
    if u:
        # Don't let a Member edit demote the last remaining admin login (lockout).
        if u.role == "admin" and role != "admin" and \
                db.query(models.User).filter(models.User.role == "admin").count() <= 1:
            raise HTTPException(400, "Cannot demote the last admin")
        u.role = role
        if not u.email:
            u.email = e
    else:
        db.add(models.User(username=e, email=e, full_name=member.name or e,
                           role=role, password_hash="google-oauth",
                           organization=member.organization or "", note=member.note or ""))


# ----- members -----

@router.get("/members", response_model=list[MemberOut])
def list_members(_: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.execute(select(Member).order_by(Member.role, Member.name)).scalars().all()


@router.post("/members", response_model=MemberOut, status_code=201)
def create_member(data: MemberCreate, _: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    obj = Member(**data.model_dump())
    db.add(obj)
    _sync_user_for_member(db, obj)   # ensure a matching login account exists + in sync
    db.commit(); db.refresh(obj)
    return obj


@router.put("/members/{member_id}", response_model=MemberOut)
def update_member(member_id: int, data: MemberUpdate, _: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    obj = db.get(Member, member_id)
    if not obj:
        raise HTTPException(404, "Member not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    _sync_user_for_member(db, obj)   # propagate role to the matching login account
    db.commit(); db.refresh(obj)
    return obj


@router.delete("/members/{member_id}", status_code=204)
def delete_member(member_id: int, _: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    obj = db.get(Member, member_id)
    if not obj:
        raise HTTPException(404, "Member not found")
    db.delete(obj); db.commit()


# ----- brands -----

@router.get("/brands", response_model=list[BrandOut])
def list_brands(_: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.execute(select(Brand).order_by(Brand.name)).scalars().all()


@router.post("/brands", response_model=BrandOut, status_code=201)
def create_brand(data: BrandCreate, _: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.execute(select(Brand).where(Brand.name.ilike(data.name))).scalars().first():
        raise HTTPException(400, "Brand already exists")
    obj = Brand(**data.model_dump())
    db.add(obj); db.commit(); db.refresh(obj)
    return obj


@router.put("/brands/{brand_id}", response_model=BrandOut)
def update_brand(brand_id: int, data: BrandUpdate, _: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    obj = db.get(Brand, brand_id)
    if not obj:
        raise HTTPException(404, "Brand not found")
    changes = data.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(obj, k, v)
    # Cascade a company change down to every campaign under this brand, so
    # Company → Brand → Campaign stays consistent.
    if "company" in changes and obj.company:
        db.query(ContentAsset).filter(ContentAsset.brand_id == obj.id).update(
            {ContentAsset.client_name: obj.company}, synchronize_session=False
        )
    db.commit(); db.refresh(obj)
    return obj


@router.delete("/brands/{brand_id}", status_code=204)
def delete_brand(brand_id: int, _: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    obj = db.get(Brand, brand_id)
    if not obj:
        raise HTTPException(404, "Brand not found")
    db.delete(obj); db.commit()

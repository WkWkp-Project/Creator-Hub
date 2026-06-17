"""Members + Brands endpoints. Reads require login; writes require admin."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import get_current_user, require_admin
from ..directory_models import (
    Brand, BrandCreate, BrandOut, BrandUpdate,
    Member, MemberCreate, MemberOut, MemberUpdate,
)

router = APIRouter(prefix="/api", tags=["directory"])


# ----- members -----

@router.get("/members", response_model=list[MemberOut])
def list_members(_: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.execute(select(Member).order_by(Member.role, Member.name)).scalars().all()


@router.post("/members", response_model=MemberOut, status_code=201)
def create_member(data: MemberCreate, _: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    obj = Member(**data.model_dump())
    db.add(obj); db.commit(); db.refresh(obj)
    return obj


@router.put("/members/{member_id}", response_model=MemberOut)
def update_member(member_id: int, data: MemberUpdate, _: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    obj = db.get(Member, member_id)
    if not obj:
        raise HTTPException(404, "Member not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
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
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit(); db.refresh(obj)
    return obj


@router.delete("/brands/{brand_id}", status_code=204)
def delete_brand(brand_id: int, _: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    obj = db.get(Brand, brand_id)
    if not obj:
        raise HTTPException(404, "Brand not found")
    db.delete(obj); db.commit()

"""Influencer CRUD + filtering endpoints."""
import io
from datetime import datetime

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import audit, crud, models, schemas
from ..database import get_db
from ..deps import get_current_user, require_admin
from .settings import get_directory_hidden_fields

# Export column order: system field -> friendly header.
# Headers are chosen so the exported file re-imports cleanly via auto-matching.
EXPORT_COLUMNS = [
    ("name", "ชื่อ"), ("handle", "Handle"), ("age", "อายุ"),
    ("location", "Location"), ("niche", "หมวดหมู่"), ("platform", "Platform"),
    ("tier", "Tier"),
    ("verified", "Verified"), ("followers", "ผู้ติดตาม"),
    ("engagement_rate", "Engagement %"), ("growth_30d", "Growth 30d"),
    ("base_rate", "ค่าตัว"), ("code_gen_fee", "ค่าเจนโค้ด"),
    ("management_fee", "ค่าเมเนจฟี"), ("agency_fee_pct", "ค่าเอเจนฟี %"),
    ("currency", "Currency"), ("bio", "Bio"), ("notes", "หมายเหตุ"),
]
LINK_EXPORT = [
    ("instagram", "Instagram Link"), ("tiktok", "TikTok Link"),
    ("youtube", "YouTube Link"), ("facebook", "Facebook Link"),
    ("twitter", "X / Twitter Link"), ("website", "Website Link"),
]

router = APIRouter(prefix="/api/influencers", tags=["influencers"])


def _serialize(obj) -> dict:
    """ORM influencer -> JSON-able dict (includes computed fee fields)."""
    return schemas.InfluencerOut.model_validate(obj).model_dump(mode="json")


def _gate_and_redact(items: list[dict], user: models.User, db: Session) -> list[dict]:
    """Admins see everything. A non-admin must be granted directory_access, and
    the globally-configured sensitive fields are stripped from the payload so
    they never reach the client (not merely hidden in the UI)."""
    if user.role == "admin":
        return items
    if not user.directory_access:
        raise HTTPException(403, "คุณไม่มีสิทธิ์ดู Directory — ติดต่อแอดมินเพื่อเปิดสิทธิ์")
    hidden = get_directory_hidden_fields(db)
    for d in items:
        for k in hidden:
            d.pop(k, None)
    return items


@router.get("")
def list_influencers(
    search: str | None = None,
    platform: str | None = None,
    niche: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    verified: bool | None = None,
    tier: str | None = None,
    sort: str = "name",
    skip: int = 0,
    limit: int = Query(50, le=200),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    total, items = crud.list_influencers(
        db, search=search, platform=platform, niche=niche,
        min_price=min_price, max_price=max_price, verified=verified,
        tier=tier, sort=sort, skip=skip, limit=limit,
    )
    return {"total": total, "items": _gate_and_redact([_serialize(o) for o in items], user, db)}


@router.get("/export")
def export_influencers(format: str = Query("xlsx", pattern="^(xlsx|csv)$"),
                      _: models.User = Depends(require_admin),
                      db: Session = Depends(get_db)):
    """Download the whole roster as Excel or CSV (re-importable round-trip).
    Admin-only: the export always contains the full fee breakdown."""
    _, items = crud.list_influencers(db, sort="name", limit=100000)

    rows = []
    for inf in items:
        row = {}
        for field, header in EXPORT_COLUMNS:
            val = getattr(inf, field, "")
            row[header] = "Yes" if (field == "verified" and val) else (
                "No" if field == "verified" else val)
        links = inf.social_links or {}
        for key, header in LINK_EXPORT:
            row[header] = links.get(key, "")
        # human-readable computed columns (named so they stay unmapped on re-import)
        row["ยอดเอเจน (คำนวณ)"] = inf.agency_amount
        row["ยอดรวมสุทธิ (คำนวณ)"] = inf.total_fee
        rows.append(row)

    df = pd.DataFrame(rows)
    stamp = datetime.now().strftime("%Y%m%d")

    if format == "csv":
        buf = io.StringIO()
        df.to_csv(buf, index=False)
        data = buf.getvalue().encode("utf-8-sig")  # BOM so Excel reads Thai
        return StreamingResponse(
            io.BytesIO(data), media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="creators_{stamp}.csv"'},
        )

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Creators")
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="creators_{stamp}.xlsx"'},
    )


@router.get("/{influencer_id}")
def get_influencer(influencer_id: int,
                   user: models.User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    obj = crud.get(db, influencer_id)
    if not obj:
        raise HTTPException(404, "Influencer not found")
    return _gate_and_redact([_serialize(obj)], user, db)[0]


@router.post("", response_model=schemas.InfluencerOut, status_code=201)
def create_influencer(data: schemas.InfluencerCreate,
                      actor: models.User = Depends(require_admin),
                      db: Session = Depends(get_db)):
    obj = crud.create(db, data)
    audit.record(
        db,
        entity="influencer",
        entity_id=obj.id,
        user=actor,
        action="created",
        summary=f"Created influencer: {obj.name}",
    )
    db.commit()
    return obj


@router.put("/{influencer_id}", response_model=schemas.InfluencerOut)
def update_influencer(
    influencer_id: int, data: schemas.InfluencerUpdate,
    actor: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    obj = crud.get(db, influencer_id)
    if not obj:
        raise HTTPException(404, "Influencer not found")
    changed_fields = sorted(data.model_dump(exclude_unset=True).keys())
    obj = crud.update(db, obj, data)
    audit.record(
        db,
        entity="influencer",
        entity_id=obj.id,
        user=actor,
        action="updated",
        summary=f"Updated influencer: {obj.name}",
        detail={"fields": changed_fields},
    )
    db.commit()
    return obj


@router.delete("/{influencer_id}", status_code=204)
def delete_influencer(influencer_id: int,
                      actor: models.User = Depends(require_admin),
                      db: Session = Depends(get_db)):
    obj = crud.get(db, influencer_id)
    if not obj:
        raise HTTPException(404, "Influencer not found")
    name = obj.name
    crud.delete(db, obj)
    audit.record(
        db,
        entity="influencer",
        entity_id=influencer_id,
        user=actor,
        action="deleted",
        summary=f"Deleted influencer: {name}",
    )
    db.commit()

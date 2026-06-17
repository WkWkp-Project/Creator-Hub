"""Spreadsheet import endpoints.

Flow:
  1. POST /api/imports/preview  -> upload CSV/XLSX, get auto-matched column map
  2. POST /api/imports/commit   -> confirm map, bulk upsert into the database

Uploaded files are cached under a temp dir keyed by a UUID so the commit
step can re-read them without a second upload.
"""
import json
import os
import re
import tempfile
import uuid

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..config import get_settings
from ..database import get_db
from ..deps import require_admin
from ..services import column_matcher as cm
from ..services.tiers import tier_for_followers

router = APIRouter(prefix="/api/imports", tags=["imports"])
settings = get_settings()

CACHE_DIR = os.path.join(tempfile.gettempdir(), "creatorhub_imports")
os.makedirs(CACHE_DIR, exist_ok=True)


def _read_dataframe(path: str, filename: str) -> pd.DataFrame:
    ext = os.path.splitext(filename)[1].lower()
    if ext == ".csv":
        return pd.read_csv(path, dtype=str, keep_default_na=False)
    return pd.read_excel(path, dtype=str, keep_default_na=False)


@router.get("/system-fields")
def system_fields():
    """Expose the field catalogue so the UI can build mapping dropdowns."""
    return [{"value": k, "label": v} for k, v in cm.SYSTEM_FIELDS.items()]


@router.post("/preview", response_model=schemas.ImportPreview)
async def preview(file: UploadFile = File(...), _: models.User = Depends(require_admin)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in settings.extensions:
        raise HTTPException(400, f"Unsupported file type '{ext}'. Allowed: {settings.extensions}")

    raw = await file.read()
    if len(raw) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(400, f"File exceeds {settings.max_upload_mb}MB limit")

    upload_id = uuid.uuid4().hex
    stored = os.path.join(CACHE_DIR, f"{upload_id}{ext}")
    with open(stored, "wb") as f:
        f.write(raw)
    # remember the original filename for the commit step
    with open(os.path.join(CACHE_DIR, f"{upload_id}.meta"), "w") as f:
        json.dump({"filename": file.filename, "ext": ext}, f)

    try:
        df = _read_dataframe(stored, file.filename or "")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"Could not parse file: {exc}") from exc

    suggestions: list[schemas.ColumnSuggestion] = []
    for col in df.columns:
        outcome = cm.match_column(col)
        sample = [str(v) for v in df[col].head(3).tolist() if str(v).strip()]
        suggestions.append(
            schemas.ColumnSuggestion(
                file_column=str(col),
                system_field=outcome.system_field,
                confidence=outcome.confidence,
                status=outcome.status,
                sample=sample,
            )
        )

    mapped = sum(1 for s in suggestions if s.system_field)
    return schemas.ImportPreview(
        upload_id=upload_id,
        filename=file.filename or "upload",
        row_count=int(len(df)),
        detected_columns=[str(c) for c in df.columns],
        suggestions=suggestions,
        system_fields=list(cm.SYSTEM_FIELDS.keys()),
        mapped_count=mapped,
    )


@router.post("/commit", response_model=schemas.ImportResult)
def commit(payload: schemas.ImportCommit,
           _: models.User = Depends(require_admin),
           db: Session = Depends(get_db)):
    # upload_id is a server-generated uuid4 hex — reject anything else so it can
    # never be used to traverse outside the cache dir.
    if not re.fullmatch(r"[0-9a-f]{32}", payload.upload_id or ""):
        raise HTTPException(400, "Invalid upload id.")
    meta_path = os.path.join(CACHE_DIR, f"{payload.upload_id}.meta")
    if not os.path.exists(meta_path):
        raise HTTPException(404, "Upload session expired or not found. Please re-upload.")
    meta = json.load(open(meta_path))
    stored = os.path.join(CACHE_DIR, f"{payload.upload_id}{meta['ext']}")

    df = _read_dataframe(stored, meta["filename"])

    # file_column -> system_field (drop unmapped / null targets)
    mapping = {m.file_column: m.system_field for m in payload.mappings if m.system_field}
    if not mapping:
        raise HTTPException(400, "No columns mapped to system fields.")

    created = updated = skipped = 0
    errors: list[str] = []

    for idx, row in df.iterrows():
        try:
            record: dict = {}
            social: dict = {}
            for file_col, sys_field in mapping.items():
                if file_col not in df.columns:
                    continue
                if sys_field in cm.LINK_FIELDS:
                    url = str(row[file_col]).strip()
                    if url and url.lower() not in {"nan", "none", "-"}:
                        social[cm.LINK_FIELDS[sys_field]] = url
                else:
                    record[sys_field] = cm.coerce(sys_field, row[file_col])
            if social:
                record["social_links"] = social

            name = record.get("name", "").strip()
            handle = record.get("handle", "").strip()
            if not name and not handle:
                skipped += 1
                continue

            # Auto-derive tier from followers when the file didn't provide one.
            if not record.get("tier") and "followers" in record:
                record["tier"] = tier_for_followers(record.get("followers"))

            existing = (
                crud.find_match(db, name, handle) if payload.update_existing else None
            )
            if existing:
                for k, v in record.items():
                    if k == "social_links" and existing.social_links:
                        merged = dict(existing.social_links)
                        merged.update(v)
                        existing.social_links = merged
                    else:
                        setattr(existing, k, v)
                updated += 1
            else:
                db.add(models.Influencer(**record))
                created += 1
        except Exception as exc:  # noqa: BLE001
            errors.append(f"Row {int(idx) + 2}: {exc}")

    db.commit()

    # cleanup cache
    for p in (stored, meta_path):
        try:
            os.remove(p)
        except OSError:
            pass

    return schemas.ImportResult(
        created=created, updated=updated, skipped=skipped, errors=errors[:25]
    )

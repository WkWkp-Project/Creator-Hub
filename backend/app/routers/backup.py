"""Local backup / restore — a safety net stored on the server's own disk.

Creates timestamped JSON snapshots of the business data (influencers + campaigns)
under `backend/backups/`, lists them, lets you download one, and can "recall"
(restore) the latest (or a chosen) snapshot to guard against accidental edits.

This is a simple local safeguard, NOT a substitute for real off-site backups.
"""
from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import DateTime
from sqlalchemy.orm import Session

from .. import models
from ..content_asset_models import ContentAsset
from ..directory_models import Brand, Member
from ..database import get_db
from ..deps import get_current_user, require_admin

router = APIRouter(prefix="/api/backup", tags=["backup"])

# BACKUPS_DIR env override (see uploads.py); defaults to <backend>/backups.
BACKUP_DIR = Path(os.environ.get("BACKUPS_DIR") or (Path(__file__).resolve().parents[2] / "backups"))
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

# Tables included in a snapshot (all business data, incl. the real campaign
# workspace + people/brand directory — not just the legacy influencers/campaigns).
_TABLES = {
    "influencers": models.Influencer,
    "campaigns": models.Campaign,
    "content_assets": ContentAsset,
    "members": Member,
    "brands": Brand,
    "change_logs": models.ChangeLog,
}
SNAPSHOT_VERSION = 1


def _serialize(obj) -> dict:
    out = {}
    for col in obj.__table__.columns:
        val = getattr(obj, col.name)
        out[col.name] = val.isoformat() if isinstance(val, datetime) else val
    return out


def _deserialize(model, data: dict):
    obj = model()
    for col in model.__table__.columns:
        if col.name not in data:
            continue
        val = data[col.name]
        if isinstance(col.type, DateTime) and isinstance(val, str):
            try:
                val = datetime.fromisoformat(val)
            except ValueError:
                val = None
        setattr(obj, col.name, val)
    return obj


def _list_paths() -> list[Path]:
    return sorted(BACKUP_DIR.glob("backup_*.json"), reverse=True)


def _snapshot_payload(db: Session) -> dict:
    return {
        "version": SNAPSHOT_VERSION,
        "created_at": datetime.now().isoformat(),
        **{name: [_serialize(r) for r in db.query(model).all()] for name, model in _TABLES.items()},
    }


@router.get("")
def list_backups(_: models.User = Depends(require_admin)):
    items = []
    for p in _list_paths():
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            data = {}
        items.append({
            "filename": p.name,
            "created_at": data.get("created_at"),
            "size_bytes": p.stat().st_size,
            "counts": {k: len(data.get(k, [])) for k in _TABLES},
        })
    return {"backups": items, "latest": items[0]["filename"] if items else None}


@router.post("", status_code=201)
def create_backup(actor: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    payload = _snapshot_payload(db)
    stamp = datetime.fromisoformat(payload["created_at"]).strftime("%Y%m%d_%H%M%S")
    filename = f"backup_{stamp}.json"
    (BACKUP_DIR / filename).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    from .. import audit
    audit.record(db, entity="backup", user=actor, action="created", summary=f"สร้าง backup: {filename}")
    db.commit()
    return {
        "filename": filename,
        "created_at": payload["created_at"],
        "counts": {k: len(payload[k]) for k in _TABLES},
    }


@router.post("/restore")
def restore_backup(
    body: dict | None = None,
    actor: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Recall a snapshot. Defaults to the latest; pass {"filename": "..."} to choose."""
    paths = _list_paths()
    if not paths:
        raise HTTPException(404, "ยังไม่มี backup ให้กู้คืน")

    filename = (body or {}).get("filename")
    if filename:
        target = BACKUP_DIR / Path(filename).name  # prevent path traversal
        if not target.exists():
            raise HTTPException(404, "ไม่พบไฟล์ backup ที่ระบุ")
    else:
        target = paths[0]

    try:
        data = json.loads(target.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"ไฟล์ backup เสียหาย: {exc}") from exc

    # Safety net: snapshot the current state before overwriting it.
    pre_payload = _snapshot_payload(db)
    pre_stamp = datetime.fromisoformat(pre_payload["created_at"]).strftime("%Y%m%d_%H%M%S")
    (BACKUP_DIR / f"backup_{pre_stamp}_pre-restore.json").write_text(
        json.dumps(pre_payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    restored = {}
    for name, model in _TABLES.items():
        db.query(model).delete()
        rows = data.get(name, [])
        db.add_all([_deserialize(model, row) for row in rows])
        restored[name] = len(rows)
    from .. import audit
    audit.record(db, entity="backup", user=actor, action="restored",
                 summary=f"กู้คืนจาก {target.name}", detail={"counts": restored})
    db.commit()

    return {"restored_from": target.name, "created_at": data.get("created_at"), "counts": restored}


@router.get("/{filename}/download")
def download_backup(
    filename: str,
    _: models.User = Depends(require_admin),
):
    target = BACKUP_DIR / Path(filename).name  # prevent path traversal
    if not target.exists():
        raise HTTPException(404, "ไม่พบไฟล์ backup")
    return FileResponse(target, media_type="application/json", filename=target.name)

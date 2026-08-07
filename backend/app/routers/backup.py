"""Local backup / restore — a safety net stored on the server's own disk.

Creates timestamped JSON snapshots of the business data (influencers + campaigns)
under `backend/backups/`, lists them, lets you download one, and can "recall"
(restore) the latest (or a chosen) snapshot to guard against accidental edits.

This is a simple local safeguard, NOT a substitute for real off-site backups.
"""
from __future__ import annotations

import json
import os
import re
from base64 import b64decode, b64encode
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import DateTime, LargeBinary
from sqlalchemy.orm import Session

from .. import models
from ..content_models import ContentBrief
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
    "content_briefs": ContentBrief,
    "members": Member,
    "brands": Brand,
    "app_settings": models.AppSetting,
    "uploaded_files": models.UploadedFile,
    "change_logs": models.ChangeLog,
}
LEGACY_TABLES = {"influencers", "campaigns", "content_assets", "members", "brands", "change_logs"}
SNAPSHOT_VERSION = 2
SUPPORTED_SNAPSHOT_VERSIONS = {1, SNAPSHOT_VERSION}
BACKUP_NAME_RE = re.compile(r"^backup_\d{8}_\d{6}(?:_pre-restore)?\.json$")


def _backup_path(filename: str) -> Path:
    """Resolve a user-supplied backup filename without path traversal."""
    name = Path(filename or "").name
    if name != filename or not BACKUP_NAME_RE.fullmatch(name):
        raise HTTPException(400, "Invalid backup filename")
    return BACKUP_DIR / name


def _serialize(obj) -> dict:
    out = {}
    for col in obj.__table__.columns:
        val = getattr(obj, col.name)
        if isinstance(val, datetime):
            val = val.isoformat()
        elif isinstance(val, bytes):
            val = {"encoding": "base64", "data": b64encode(val).decode("ascii")}
        out[col.name] = val
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
        elif isinstance(col.type, LargeBinary):
            if not isinstance(val, dict) or val.get("encoding") != "base64":
                raise HTTPException(400, f"Invalid binary data in {model.__tablename__}.{col.name}")
            try:
                val = b64decode(val.get("data", ""), validate=True)
            except (ValueError, TypeError) as exc:
                raise HTTPException(400, f"Invalid binary data in {model.__tablename__}.{col.name}") from exc
        setattr(obj, col.name, val)
    return obj


def _list_paths() -> list[Path]:
    return sorted(BACKUP_DIR.glob("backup_*.json"), reverse=True)


def _snapshot_payload(db: Session) -> dict:
    return {
        "version": SNAPSHOT_VERSION,
        "created_at": datetime.now().isoformat(),
        "account_refs": [
            {"id": u.id, "username": u.username, "email": u.email, "role": u.role}
            for u in db.query(models.User).all()
        ],
        **{name: [_serialize(r) for r in db.query(model).all()] for name, model in _TABLES.items()},
    }


def _meta_path(path: Path) -> Path:
    return path.with_suffix(path.suffix + ".meta")


def _write_json_atomic(path: Path, data: dict) -> None:
    temp = path.with_suffix(path.suffix + ".tmp")
    try:
        temp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def _write_snapshot(db: Session, path: Path, created_at: str | None = None) -> dict:
    """Stream a compact snapshot to disk without retaining every table in RAM."""
    created_at = created_at or datetime.now().isoformat()
    encoder = json.JSONEncoder(ensure_ascii=False, separators=(",", ":"))
    temp = path.with_suffix(path.suffix + ".tmp")
    counts: dict[str, int] = {}
    try:
        with temp.open("w", encoding="utf-8", newline="") as handle:
            handle.write('{"version":')
            handle.write(str(SNAPSHOT_VERSION))
            handle.write(',"created_at":')
            handle.write(encoder.encode(created_at))
            account_refs = [
                {"id": user.id, "username": user.username, "email": user.email, "role": user.role}
                for user in db.query(models.User).yield_per(100)
            ]
            handle.write(',"account_refs":')
            handle.write(encoder.encode(account_refs))
            for name, model in _TABLES.items():
                handle.write(",")
                handle.write(encoder.encode(name))
                handle.write(":[")
                count = 0
                for row in db.query(model).yield_per(100):
                    if count:
                        handle.write(",")
                    handle.write(encoder.encode(_serialize(row)))
                    count += 1
                handle.write("]")
                counts[name] = count
            handle.write("}")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)

    metadata = {"created_at": created_at, "counts": counts}
    _write_json_atomic(_meta_path(path), metadata)
    return metadata


def _validate_snapshot_payload(data: dict) -> None:
    """Refuse malformed snapshots before any destructive restore step."""
    if not isinstance(data, dict):
        raise HTTPException(400, "ไฟล์ backup ไม่ถูกต้อง")
    version = data.get("version")
    if version not in SUPPORTED_SNAPSHOT_VERSIONS:
        raise HTTPException(400, "เวอร์ชัน backup ไม่รองรับ")
    if not data.get("created_at"):
        raise HTTPException(400, "ไฟล์ backup ไม่มี created_at")
    if version >= 2 and not isinstance(data.get("account_refs"), list):
        raise HTTPException(400, "Backup account references are missing")
    required_tables = LEGACY_TABLES if version == 1 else set(_TABLES)
    for name in required_tables:
        if name not in data or not isinstance(data[name], list):
            raise HTTPException(400, f"ไฟล์ backup ไม่ครบ: {name}")
        if not all(isinstance(row, dict) for row in data[name]):
            raise HTTPException(400, f"Invalid rows in backup table: {name}")


def _validate_account_refs(data: dict, db: Session) -> None:
    """Ensure restored campaign grants cannot move to a different account."""
    if data.get("version") < 2:
        return
    refs = {
        int(row["id"]): row
        for row in data.get("account_refs", [])
        if isinstance(row, dict) and row.get("id") is not None
    }
    assigned_ids: set[int] = set()
    for asset in data.get("content_assets", []):
        if not isinstance(asset, dict):
            continue
        assigned_ids.update(
            int(value) for value in (asset.get("assigned_user_ids") or [])
            if str(value).isdigit()
        )
    current = {
        user.id: user
        for user in db.query(models.User).filter(models.User.id.in_(assigned_ids)).all()
    } if assigned_ids else {}
    for user_id in assigned_ids:
        ref = refs.get(user_id)
        user = current.get(user_id)
        if not ref or not user or user.username != ref.get("username"):
            raise HTTPException(409, "Backup account assignments do not match this installation")


@router.get("")
def list_backups(_: models.User = Depends(require_admin)):
    items = []
    for p in _list_paths():
        try:
            metadata = json.loads(_meta_path(p).read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
                metadata = {
                    "created_at": data.get("created_at"),
                    "counts": {key: len(data.get(key, [])) for key in _TABLES},
                }
                _write_json_atomic(_meta_path(p), metadata)
            except Exception:  # noqa: BLE001
                metadata = {"created_at": None, "counts": {}}
        items.append({
            "filename": p.name,
            "created_at": metadata.get("created_at"),
            "size_bytes": p.stat().st_size,
            "counts": {key: int((metadata.get("counts") or {}).get(key, 0)) for key in _TABLES},
        })
    return {"backups": items, "latest": items[0]["filename"] if items else None}


@router.post("", status_code=201)
def create_backup(actor: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    created_at = datetime.now().isoformat()
    stamp = datetime.fromisoformat(created_at).strftime("%Y%m%d_%H%M%S")
    filename = f"backup_{stamp}.json"
    metadata = _write_snapshot(db, BACKUP_DIR / filename, created_at)
    from .. import audit
    audit.record(db, entity="backup", user=actor, action="created", summary=f"สร้าง backup: {filename}")
    db.commit()
    return {
        "filename": filename,
        "created_at": metadata["created_at"],
        "counts": metadata["counts"],
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
        target = _backup_path(filename)
        if not target.exists():
            raise HTTPException(404, "ไม่พบไฟล์ backup ที่ระบุ")
    else:
        target = paths[0]

    try:
        data = json.loads(target.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"ไฟล์ backup เสียหาย: {exc}") from exc
    _validate_snapshot_payload(data)
    _validate_account_refs(data, db)

    # Decode and validate every row before deleting anything. Legacy v1 files
    # omit newer tables; those tables are left untouched during a v1 restore.
    prepared = {
        name: [_deserialize(model, row) for row in data[name]]
        for name, model in _TABLES.items()
        if name in data
    }

    # Safety net: snapshot the current state before overwriting it.
    pre_created_at = datetime.now().isoformat()
    pre_stamp = datetime.fromisoformat(pre_created_at).strftime("%Y%m%d_%H%M%S")
    _write_snapshot(db, BACKUP_DIR / f"backup_{pre_stamp}_pre-restore.json", pre_created_at)

    restored = {}
    for name, model in _TABLES.items():
        if name not in prepared:
            continue
        db.query(model).delete(synchronize_session=False)
        db.add_all(prepared[name])
        restored[name] = len(prepared[name])
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
    target = _backup_path(filename)
    if not target.exists():
        raise HTTPException(404, "ไม่พบไฟล์ backup")
    return FileResponse(target, media_type="application/json", filename=target.name)

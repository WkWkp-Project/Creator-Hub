"""File upload endpoints for user-managed media (avatars + campaign media).

Uploaded bytes are stored IN the database (models.UploadedFile) so they survive
on hosts with an ephemeral filesystem (e.g. Render wipes local disk on every
restart/redeploy). A best-effort copy is also written to disk as a fast local
cache; the DB copy is authoritative. The public URL is unchanged
("/uploads/<category>/<name>") and is served by ``files_router`` below —
reading from the DB first, then falling back to any legacy file on disk.
"""
import os
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..config import get_settings
from ..database import get_db
from ..deps import require_admin

router = APIRouter(prefix="/api/uploads", tags=["uploads"])
# Serves the public media URLs (/uploads/...); no /api prefix, no auth (an
# <img> tag cannot send an Authorization header — matches the old StaticFiles mount).
files_router = APIRouter(tags=["uploads"])
settings = get_settings()

# UPLOADS_DIR env override lets the packaged desktop build / container point this
# at a writable location; defaults to <backend>/uploads.
UPLOAD_ROOT = Path(os.environ.get("UPLOADS_DIR") or (Path(__file__).resolve().parents[2] / "uploads"))
AVATAR_DIR = UPLOAD_ROOT / "avatars"
CAMPAIGN_MEDIA_DIR = UPLOAD_ROOT / "campaigns"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)
CAMPAIGN_MEDIA_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_AVATAR_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_AVATAR_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}
ALLOWED_CAMPAIGN_MEDIA_EXTENSIONS = ALLOWED_AVATAR_EXTENSIONS | {".mp4", ".webm", ".mov"}
ALLOWED_CAMPAIGN_MEDIA_CONTENT_TYPES = ALLOWED_AVATAR_CONTENT_TYPES | {
    "video/mp4",
    "video/webm",
    "video/quicktime",
}
CAMPAIGN_MEDIA_MAX_MB = max(settings.max_upload_mb, 50)

_EXT_CONTENT_TYPE = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".webp": "image/webp", ".gif": "image/gif",
    ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
}
_SAFE_NAME = re.compile(r"^[A-Za-z0-9._-]+$")
_CATEGORY_DIR = {"avatars": AVATAR_DIR, "campaigns": CAMPAIGN_MEDIA_DIR}


def _looks_like_supported_image(raw: bytes, ext: str) -> bool:
    signatures = {
        ".jpg": (b"\xff\xd8\xff",),
        ".jpeg": (b"\xff\xd8\xff",),
        ".png": (b"\x89PNG\r\n\x1a\n",),
        ".gif": (b"GIF87a", b"GIF89a"),
        ".webp": (b"RIFF",),
    }
    if ext == ".webp":
        return raw.startswith(b"RIFF") and raw[8:12] == b"WEBP"
    return any(raw.startswith(sig) for sig in signatures.get(ext, ()))


def _looks_like_supported_video(raw: bytes, ext: str) -> bool:
    if ext in {".mp4", ".mov"}:
        return len(raw) >= 12 and raw[4:8] == b"ftyp"
    if ext == ".webm":
        return raw.startswith(b"\x1a\x45\xdf\xa3")
    return False


def _media_type_for(ext: str) -> str:
    return "image" if ext in ALLOWED_AVATAR_EXTENSIONS else "video"


def _content_type_for(ext: str, uploaded: str | None) -> str:
    return _EXT_CONTENT_TYPE.get(ext) or uploaded or "application/octet-stream"


def _persist(db: Session, category: str, ext: str, raw: bytes, content_type: str) -> str:
    """Store the bytes in the DB (durable) + best-effort on disk (fast cache).
    Returns the stored file name."""
    stored_name = f"{uuid.uuid4().hex}{ext}"
    path = f"{category}/{stored_name}"
    db.add(models.UploadedFile(path=path, content=raw, content_type=content_type))
    db.commit()
    try:  # local cache; on an ephemeral/read-only fs this may fail — the DB copy wins
        (_CATEGORY_DIR[category] / stored_name).write_bytes(raw)
    except OSError:
        pass
    return stored_name


@router.post("/avatar")
async def upload_avatar(file: UploadFile = File(...), _: models.User = Depends(require_admin),
                        db: Session = Depends(get_db)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_AVATAR_EXTENSIONS:
        raise HTTPException(400, "Avatar must be a JPG, PNG, WebP, or GIF image.")

    if file.content_type and file.content_type.lower() not in ALLOWED_AVATAR_CONTENT_TYPES:
        raise HTTPException(400, "Unsupported avatar content type.")

    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Avatar file is empty.")
    if len(raw) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(400, f"Avatar exceeds {settings.max_upload_mb}MB limit.")
    if not _looks_like_supported_image(raw, ext):
        raise HTTPException(400, "Avatar file does not look like a supported image.")

    stored_name = _persist(db, "avatars", ext, raw, _content_type_for(ext, file.content_type))
    return {"url": f"/uploads/avatars/{stored_name}"}


@router.post("/campaign-media")
async def upload_campaign_media(file: UploadFile = File(...), _: models.User = Depends(require_admin),
                                db: Session = Depends(get_db)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_CAMPAIGN_MEDIA_EXTENSIONS:
        raise HTTPException(400, "Campaign media must be an image or MP4/WebM/MOV video.")

    if file.content_type and file.content_type.lower() not in ALLOWED_CAMPAIGN_MEDIA_CONTENT_TYPES:
        raise HTTPException(400, "Unsupported campaign media content type.")

    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Campaign media file is empty.")
    if len(raw) > CAMPAIGN_MEDIA_MAX_MB * 1024 * 1024:
        raise HTTPException(400, f"Campaign media exceeds {CAMPAIGN_MEDIA_MAX_MB}MB limit.")

    media_type = _media_type_for(ext)
    if media_type == "image":
        looks_valid = _looks_like_supported_image(raw, ext)
    else:
        looks_valid = _looks_like_supported_video(raw, ext)
    if not looks_valid:
        raise HTTPException(400, "Campaign media does not look like a supported image or video.")

    stored_name = _persist(db, "campaigns", ext, raw, _content_type_for(ext, file.content_type))
    return {"url": f"/uploads/campaigns/{stored_name}", "media_type": media_type}


@files_router.get("/uploads/{category}/{filename}")
def serve_upload(category: str, filename: str, db: Session = Depends(get_db)):
    """Public media URL. Serves from the DB (durable copy), falling back to a
    legacy file still on local disk. Filenames are content hashes → cache hard."""
    if category not in _CATEGORY_DIR or not _SAFE_NAME.match(filename):
        raise HTTPException(404, "File not found")
    path = f"{category}/{filename}"
    rec = db.execute(select(models.UploadedFile).where(models.UploadedFile.path == path)).scalar_one_or_none()
    cache = {"Cache-Control": "public, max-age=31536000, immutable"}
    if rec is not None:
        return Response(content=rec.content, media_type=rec.content_type or "application/octet-stream", headers=cache)
    disk = _CATEGORY_DIR[category] / filename
    if disk.is_file():
        return FileResponse(disk, headers=cache)
    raise HTTPException(404, "File not found")

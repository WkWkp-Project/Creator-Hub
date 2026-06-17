"""File upload endpoints for user-managed media (avatars + campaign media)."""
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from .. import models
from ..config import get_settings
from ..deps import require_admin

router = APIRouter(prefix="/api/uploads", tags=["uploads"])
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


@router.post("/avatar")
async def upload_avatar(file: UploadFile = File(...), _: models.User = Depends(require_admin)):
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

    stored_name = f"{uuid.uuid4().hex}{ext}"
    stored_path = AVATAR_DIR / stored_name
    stored_path.write_bytes(raw)

    return {"url": f"/uploads/avatars/{stored_name}"}


@router.post("/campaign-media")
async def upload_campaign_media(file: UploadFile = File(...), _: models.User = Depends(require_admin)):
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

    stored_name = f"{uuid.uuid4().hex}{ext}"
    stored_path = CAMPAIGN_MEDIA_DIR / stored_name
    stored_path.write_bytes(raw)

    return {"url": f"/uploads/campaigns/{stored_name}", "media_type": media_type}

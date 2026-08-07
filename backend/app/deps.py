"""FastAPI auth dependencies — current user + role guards.

The bearer token is read from the ``Authorization`` header, or (as a fallback
for plain links like file downloads) from a ``token`` query parameter.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from . import models
from .database import get_db
from .security import decode_token


def _allows_query_token(request: Request) -> bool:
    """Permit URL tokens only for browser-opened downloads/exports.

    Normal API calls must use the Authorization header so bearer tokens do not
    spread through URLs, browser history, referrers, or access logs.
    """
    if request.method.upper() != "GET":
        return False
    path = request.url.path
    if path == "/api/influencers/export":
        return True
    if path.startswith("/api/assets/") and path.endswith("/export"):
        return True
    if path.startswith("/api/backup/") and path.endswith("/download"):
        return True
    return False


def _extract_token(request: Request, token: str | None) -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return token if token and _allows_query_token(request) else None


def get_current_user(
    request: Request,
    token: str | None = Query(None),
    db: Session = Depends(get_db),
) -> models.User:
    raw = _extract_token(request, token)
    payload = decode_token(raw) if raw else None
    if not payload:
        raise HTTPException(401, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    user = db.query(models.User).filter(models.User.username == payload.get("sub")).first()
    if not user:
        raise HTTPException(401, "User no longer exists")
    # Reject tokens issued before the user's current token_version (revoked).
    if int(payload.get("tv", 0)) != int(user.token_version or 0):
        raise HTTPException(401, "Session expired — please sign in again",
                            headers={"WWW-Authenticate": "Bearer"})
    return user


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role != "admin":
        raise HTTPException(403, "Admin privileges required")
    return user

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


def _extract_token(request: Request, token: str | None) -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return token


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
    return user


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role != "admin":
        raise HTTPException(403, "Admin privileges required")
    return user

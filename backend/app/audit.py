"""Central audit trail — an append-only record of security-relevant actions.

There is no API to edit or delete ChangeLog rows, so the trail is immutable in
practice; each entry pins the actor's user id (not just a display name) for
non-repudiation, and may carry a before/after `detail`.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from . import models


def record(
    db: Session,
    *,
    entity: str,
    action: str,
    user: models.User | None = None,
    entity_id: int | None = None,
    summary: str = "",
    detail: dict | None = None,
) -> None:
    db.add(models.ChangeLog(
        entity=entity,
        asset_id=entity_id,
        actor=((user.full_name or user.email or user.username) if user else "system"),
        actor_id=(user.id if user else None),
        action=action,
        summary=summary[:400],
        detail=detail,
    ))

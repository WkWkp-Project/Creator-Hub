"""Global app settings.

Currently holds the Directory field allowlist: which influencer fields are
hidden from every non-admin viewer. The actual server-side redaction lives in
routers/influencers.py (it imports `get_directory_hidden_fields` from here).
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import require_admin

router = APIRouter(prefix="/api/settings", tags=["settings"])

# Fields a non-admin can be restricted from seeing. Money fields (and their
# computed totals) are listed together so a hidden value can't be backed out
# from the others.
DIRECTORY_FIELD_CATALOG = [
    {"key": "base_rate", "label": "ค่าตัว (Base Rate)", "group": "money"},
    {"key": "code_gen_fee", "label": "ค่าเจนโค้ด (Code Gen)", "group": "money"},
    {"key": "management_fee", "label": "ค่าเมเนจฟี (Management)", "group": "money"},
    {"key": "agency_fee_pct", "label": "ค่าเอเจน % (Agency %)", "group": "money"},
    {"key": "subtotal_fee", "label": "ยอดรวมย่อย (Subtotal)", "group": "money"},
    {"key": "agency_amount", "label": "ยอดเอเจน (Agency Amount)", "group": "money"},
    {"key": "total_fee", "label": "ยอดรวมสุทธิ (Total)", "group": "money"},
    {"key": "engagement_rate", "label": "Engagement Rate", "group": "metrics"},
    {"key": "growth_30d", "label": "Growth 30d", "group": "metrics"},
    {"key": "past_campaigns", "label": "Past Campaigns", "group": "other"},
]
_CATALOG_KEYS = {f["key"] for f in DIRECTORY_FIELD_CATALOG}
# Safe default: hide the whole money group from non-admins until an admin says otherwise.
_DEFAULT_HIDDEN = [f["key"] for f in DIRECTORY_FIELD_CATALOG if f["group"] == "money"]
_SETTING_KEY = "directory"


def get_directory_hidden_fields(db: Session) -> set[str]:
    """The set of influencer fields to strip for non-admin viewers."""
    row = db.get(models.AppSetting, _SETTING_KEY)
    if row is None:
        return set(_DEFAULT_HIDDEN)
    fields = (row.value or {}).get("hidden_fields")
    if not isinstance(fields, list):
        return set(_DEFAULT_HIDDEN)
    return {f for f in fields if f in _CATALOG_KEYS}


class DirectorySettingIn(BaseModel):
    hidden_fields: list[str]


@router.get("/directory")
def get_directory_settings(_: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    return {"catalog": DIRECTORY_FIELD_CATALOG, "hidden_fields": sorted(get_directory_hidden_fields(db))}


@router.put("/directory")
def set_directory_settings(data: DirectorySettingIn, _: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    clean = sorted({f for f in data.hidden_fields if f in _CATALOG_KEYS})
    row = db.get(models.AppSetting, _SETTING_KEY)
    if row is None:
        db.add(models.AppSetting(key=_SETTING_KEY, value={"hidden_fields": clean}))
    else:
        row.value = {"hidden_fields": clean}
    db.commit()
    return {"catalog": DIRECTORY_FIELD_CATALOG, "hidden_fields": clean}

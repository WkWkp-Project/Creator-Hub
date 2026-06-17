"""Influencer tier classification.

Tiers follow the common Thai influencer-market convention, collapsed to the
three bands the dashboard tracks:

    Nano   : < 10,000 followers
    Micro  : 10,000 – 999,999 followers
    Mega   : >= 1,000,000 followers

`tier_for_followers` is the single source of truth used by both the create/update
flow (to auto-fill an unspecified tier) and the spreadsheet importer.
"""
from __future__ import annotations

NANO_MAX = 10_000          # below this -> Nano
MEGA_MIN = 1_000_000       # at/above this -> Mega

TIERS = ("Nano", "Micro", "Mega")
_CANONICAL = {t.lower(): t for t in TIERS}


def tier_for_followers(followers: int | float | None) -> str:
    """Return the tier label for a follower count."""
    n = int(followers or 0)
    if n >= MEGA_MIN:
        return "Mega"
    if n >= NANO_MAX:
        return "Micro"
    return "Nano"


def normalize_tier(value) -> str:
    """Coerce free-text tier input to a canonical label, or '' if unknown."""
    return _CANONICAL.get(str(value or "").strip().lower(), "")

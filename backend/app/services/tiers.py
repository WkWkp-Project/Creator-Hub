"""Influencer tier classification.

Five-band "Influencer Pyramid" convention used across the dashboard:

    Nano     : < 10,000 followers
    Micro    : 10,000 – 49,999 followers
    Mid-Tier : 50,000 – 99,999 followers
    Macro    : 100,000 – 999,999 followers
    Mega     : >= 1,000,000 followers

`tier_for_followers` is the single source of truth used by both the create/update
flow (to auto-fill an unspecified tier) and the spreadsheet importer. The tier may
also be set to a free-text custom label, which is preserved as-is.
"""
from __future__ import annotations

# Lower bound of each band (followers >= bound -> that band).
NANO_MAX = 10_000          # below this -> Nano
MICRO_MAX = 50_000         # at/above NANO_MAX, below this -> Micro
MIDTIER_MAX = 100_000      # at/above MICRO_MAX, below this -> Mid-Tier
MACRO_MAX = 1_000_000      # at/above MIDTIER_MAX, below this -> Macro; >= this -> Mega

TIERS = ("Nano", "Micro", "Mid-Tier", "Macro", "Mega")
_CANONICAL = {t.lower(): t for t in TIERS}


def tier_for_followers(followers: int | float | None) -> str:
    """Return the tier label for a follower count."""
    n = int(followers or 0)
    if n >= MACRO_MAX:
        return "Mega"
    if n >= MIDTIER_MAX:
        return "Macro"
    if n >= MICRO_MAX:
        return "Mid-Tier"
    if n >= NANO_MAX:
        return "Micro"
    return "Nano"


def normalize_tier(value) -> str:
    """Coerce free-text tier input to a canonical label, or '' if unknown."""
    return _CANONICAL.get(str(value or "").strip().lower(), "")

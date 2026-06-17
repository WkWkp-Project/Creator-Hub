"""Auto-matching engine for spreadsheet imports.

Given the header row of an uploaded CSV/XLSX, we guess which system field
each column maps to. Matching combines:

1. A curated synonym dictionary (handles Thai + English aliases such as
   "ค่าตัว" -> base_rate, "Insta_Handle" -> handle).
2. Fuzzy string similarity (rapidfuzz) as a fallback.

We also normalise messy values: "1.2M" -> 1_200_000, "$5,000" -> 5000.0,
"4.8%" -> 4.8 so imported data lands clean in the database.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from rapidfuzz import fuzz

# System fields the importer can target, with human labels for the UI.
SYSTEM_FIELDS: dict[str, str] = {
    "name": "Name",
    "handle": "Handle",
    "avatar_url": "Avatar URL",
    "age": "Age",
    "bio": "Bio",
    "location": "Location",
    "active_since": "Active Since",
    "niche": "Niche",
    "platform": "Platform",
    "tier": "Tier (Nano/Micro/Mega)",
    "verified": "Verified",
    "followers": "Followers",
    "engagement_rate": "Engagement Rate",
    "growth_30d": "Growth 30d",
    "base_rate": "Base Rate (ค่าตัว)",
    "code_gen_fee": "Code Gen Fee (ค่าเจนโค้ด)",
    "management_fee": "Management Fee (ค่าเมเนจฟี)",
    "agency_fee_pct": "Agency Fee % (ค่าเอเจนฟี %)",
    "currency": "Currency",
    "brand_safety": "Brand Safety",
    "audience_alignment": "Audience Alignment",
    "content_quality": "Content Quality",
    "reliability": "Reliability",
    "link_instagram": "Instagram Link",
    "link_tiktok": "TikTok Link",
    "link_youtube": "YouTube Link",
    "link_facebook": "Facebook Link",
    "link_twitter": "X / Twitter Link",
    "link_website": "Website Link",
    "notes": "Notes",
}

# Aliases / synonyms (lower-cased, no separators) -> system field.
SYNONYMS: dict[str, list[str]] = {
    "name": ["name", "fullname", "creatorname", "influencer", "influencername", "ชื่อ", "ชื่อจริง"],
    "handle": ["handle", "username", "instahandle", "ighandle", "tiktokhandle",
               "socialhandle", "account", "@", "ยูสเซอร์เนม", "บัญชี"],
    "avatar_url": ["avatar", "avatarurl", "photo", "image", "imageurl", "picture",
                   "profilepic", "profileimage", "รูป", "รูปโปรไฟล์"],
    "age": ["age", "อายุ"],
    "bio": ["bio", "biography", "about", "description", "summary", "profile",
            "ประวัติ", "ประวัติคร่าวๆ", "เกี่ยวกับ"],
    "location": ["location", "city", "country", "based", "region", "ที่อยู่", "เมือง"],
    "active_since": ["activesince", "since", "started", "joined", "เริ่ม"],
    "niche": ["niche", "category", "categories", "vertical", "topic", "genre",
              "หมวดหมู่", "ประเภท", "สายงาน"],
    "platform": ["platform", "channel", "socialplatform", "แพลตฟอร์ม", "ช่องทาง"],
    "tier": ["tier", "influencertier", "level", "grade", "ระดับ", "เทียร์", "ขนาด"],
    "verified": ["verified", "isverified", "verification", "ยืนยันตัวตน"],
    "followers": ["followers", "totalfollowers", "follower", "audience", "reach",
                  "totalreach", "subscribers", "subs", "ผู้ติดตาม", "ฟอลโลเวอร์"],
    "engagement_rate": ["engagement", "engagementrate", "er", "engrate",
                        "เอนเกจเมนต์", "อัตรามีส่วนร่วม"],
    "growth_30d": ["growth", "growth30d", "growthrate", "monthlygrowth", "การเติบโต"],
    "base_rate": ["baserate", "rate", "price", "cost", "talentfee", "fee",
                  "costperpost", "basefee", "ค่าตัว", "ราคาค่าตัว", "ราคา"],
    "code_gen_fee": ["codegenfee", "codegeneration", "codefee", "gencode",
                     "codegen", "ค่าเจนโค้ด", "ค่าเจนโค๊ด", "เจนโค้ด"],
    "management_fee": ["managementfee", "managefee", "mgmtfee", "managerfee",
                       "ค่าเมเนจฟี", "ค่าจัดการ", "เมเนจฟี"],
    "agency_fee_pct": ["agencyfee", "agentfee", "agency", "agencyfeepct", "agencypercent",
                       "agencypercentage", "agencyrate", "commission", "ค่าเอเจนฟี",
                       "ค่าเอเจนซี", "เอเจนฟี", "ค่าคอม", "เปอร์เซ็นต์เอเจน"],
    "currency": ["currency", "ccy", "สกุลเงิน"],
    "brand_safety": ["brandsafety", "safety", "ความปลอดภัยแบรนด์"],
    "audience_alignment": ["audiencealignment", "alignment", "audiencefit", "ความเหมาะสมผู้ชม"],
    "content_quality": ["contentquality", "quality", "คุณภาพคอนเทนต์"],
    "reliability": ["reliability", "reliable", "ความน่าเชื่อถือ"],
    "link_instagram": ["instagramlink", "instagramurl", "iglink", "igurl", "instagram",
                       "instaurl", "instalink", "ลิงก์ไอจี", "ลิงค์ไอจี", "ไอจี"],
    "link_tiktok": ["tiktoklink", "tiktokurl", "tiktok", "ttlink", "ลิงก์ติ๊กต๊อก", "ติ๊กต๊อก"],
    "link_youtube": ["youtubelink", "youtubeurl", "youtube", "ytlink", "yturl",
                     "channellink", "ลิงก์ยูทูบ", "ยูทูบ"],
    "link_facebook": ["facebooklink", "facebookurl", "facebook", "fblink", "fburl",
                      "ลิงก์เฟซบุ๊ก", "เฟซบุ๊ก"],
    "link_twitter": ["twitterlink", "twitterurl", "xlink", "twitter", "xcom",
                     "ลิงก์ทวิตเตอร์", "ทวิตเตอร์"],
    "link_website": ["website", "websitelink", "websiteurl", "web", "homepage",
                     "site", "url", "เว็บไซต์", "ลิงก์เว็บ"],
    "notes": ["notes", "note", "remark", "remarks", "comment", "หมายเหตุ"],
}

MATCH_THRESHOLD = 80   # >= -> "matched"
REVIEW_THRESHOLD = 63  # >= -> "review" (suggested but confirm)


def _normalize(text: str) -> str:
    """Lower-case and strip non-alphanumeric (keep Thai characters)."""
    return re.sub(r"[^0-9a-z\u0E00-\u0E7F]", "", str(text).lower())


@dataclass
class MatchOutcome:
    system_field: str | None
    confidence: float
    status: str


def match_column(header: str) -> MatchOutcome:
    """Return the best system field guess for one file column header."""
    norm = _normalize(header)
    if not norm:
        return MatchOutcome(None, 0.0, "unmapped")

    best_field: str | None = None
    best_score = 0.0

    for field, aliases in SYNONYMS.items():
        for alias in aliases:
            alias_norm = _normalize(alias)
            if not alias_norm:
                continue
            if norm == alias_norm:
                score = 100.0
            # Substring matching only for aliases long enough to be meaningful —
            # short aliases like "er" or "age" must match exactly, otherwise they
            # produce false positives (e.g. "er" inside "intERnalref").
            elif len(alias_norm) >= 4 and (alias_norm in norm or norm in alias_norm):
                score = 92.0
            elif len(alias_norm) >= 4:
                score = fuzz.token_sort_ratio(norm, alias_norm)
            else:
                score = 0.0
            if score > best_score:
                best_score, best_field = score, field

    if best_score >= MATCH_THRESHOLD:
        status = "matched"
    elif best_score >= REVIEW_THRESHOLD:
        status = "review"
    else:
        best_field, status = None, "unmapped"

    return MatchOutcome(best_field, round(best_score, 1), status)


# ---------- Value coercion ----------

_SUFFIX = {"k": 1_000, "m": 1_000_000, "b": 1_000_000_000}


def parse_number(value) -> float | None:
    """'1.2M' -> 1200000, '$5,000' -> 5000, '4.8%' -> 4.8, '' -> None."""
    if value is None:
        return None
    s = str(value).strip().lower().replace(",", "").replace("$", "").replace("%", "")
    if not s or s in {"nan", "none", "-"}:
        return None
    mult = 1
    if s and s[-1] in _SUFFIX:
        mult = _SUFFIX[s[-1]]
        s = s[:-1]
    try:
        return float(s) * mult
    except ValueError:
        return None


def parse_int(value) -> int | None:
    num = parse_number(value)
    return int(num) if num is not None else None


def parse_bool(value) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "y", "verified", "ใช่", "จริง"}


# Which parser applies to each numeric / typed field.
INT_FIELDS = {"age", "followers"}
FLOAT_FIELDS = {
    "engagement_rate", "growth_30d", "base_rate", "code_gen_fee",
    "management_fee", "agency_fee_pct", "brand_safety", "audience_alignment",
    "content_quality", "reliability",
}
BOOL_FIELDS = {"verified"}

# Columns whose values fold into the social_links JSON dict on import.
LINK_FIELDS = {
    "link_instagram": "instagram",
    "link_tiktok": "tiktok",
    "link_youtube": "youtube",
    "link_facebook": "facebook",
    "link_twitter": "twitter",
    "link_website": "website",
}


def _normalize_tier(value) -> str:
    """Map free-text tier cells to a canonical label; '' if unknown/blank."""
    from .tiers import normalize_tier
    return normalize_tier(value)


def coerce(field: str, value):
    """Coerce a raw spreadsheet cell into the right Python type for `field`."""
    if field in INT_FIELDS:
        return parse_int(value) or 0
    if field in FLOAT_FIELDS:
        return parse_number(value) or 0.0
    if field in BOOL_FIELDS:
        return parse_bool(value)
    if field == "tier":
        return _normalize_tier(value)
    return "" if value is None else str(value).strip()

"""Aggregate stats for dashboards. All endpoints require a logged-in user."""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models
from ..content_asset_models import ContentAsset
from ..directory_models import Brand, Member
from ..database import get_db
from ..deps import get_current_user, require_admin

router = APIRouter(prefix="/api/stats", tags=["stats"])


def _num(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


@router.get("")
def overview(_: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    total = db.scalar(select(func.count(models.Influencer.id))) or 0
    verified = db.scalar(
        select(func.count(models.Influencer.id)).where(models.Influencer.verified.is_(True))
    ) or 0
    avg_er = db.scalar(select(func.avg(models.Influencer.engagement_rate))) or 0.0
    total_reach = db.scalar(select(func.sum(models.Influencer.followers))) or 0

    niches = db.execute(
        select(models.Influencer.niche, func.count(models.Influencer.id))
        .group_by(models.Influencer.niche)
    ).all()
    platforms = db.execute(
        select(models.Influencer.platform, func.count(models.Influencer.id))
        .group_by(models.Influencer.platform)
    ).all()
    tiers = db.execute(
        select(models.Influencer.tier, func.count(models.Influencer.id))
        .group_by(models.Influencer.tier)
    ).all()

    tier_order = {"Nano": 0, "Micro": 1, "Mid-Tier": 2, "Macro": 3, "Mega": 4}
    tier_rows = sorted(
        [{"name": t or "Unranked", "count": c} for t, c in tiers],
        key=lambda r: tier_order.get(r["name"], 99),
    )

    return {
        "total_influencers": total,
        "verified": verified,
        "avg_engagement_rate": round(float(avg_er), 2),
        "total_reach": int(total_reach),
        "niches": [{"name": n or "Uncategorized", "count": c} for n, c in niches],
        "platforms": [{"name": p or "Unknown", "count": c} for p, c in platforms],
        "tiers": tier_rows,
    }


@router.get("/niche-performance")
def niche_performance(_: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Per-niche group comparison across multiple performance dimensions."""
    influencers = db.execute(select(models.Influencer)).scalars().all()
    groups: dict[str, list[models.Influencer]] = {}
    for inf in influencers:
        # An influencer can belong to several comma-separated niches.
        for raw in (inf.niche or "Uncategorized").split(","):
            key = raw.strip() or "Uncategorized"
            groups.setdefault(key, []).append(inf)

    rows = []
    for niche, members in groups.items():
        n = len(members)
        total_reach = sum(m.followers or 0 for m in members)
        avg_er = sum(m.engagement_rate or 0 for m in members) / n
        avg_growth = sum(m.growth_30d or 0 for m in members) / n
        avg_fee = sum(m.total_fee for m in members) / n
        avg_quality = sum(
            ((m.brand_safety or 0) + (m.audience_alignment or 0)
             + (m.content_quality or 0) + (m.reliability or 0)) / 4
            for m in members
        ) / n
        # Cost efficiency: reach delivered per 1,000 THB of total fee.
        total_fee = sum(m.total_fee for m in members) or 0
        reach_per_1k = (total_reach / total_fee * 1000) if total_fee else 0
        rows.append({
            "niche": niche,
            "count": n,
            "total_reach": int(total_reach),
            "avg_engagement_rate": round(avg_er, 2),
            "avg_growth_30d": round(avg_growth, 2),
            "avg_total_fee": round(avg_fee, 2),
            "avg_fit_score": round(avg_quality, 1),
            "reach_per_1k_thb": round(reach_per_1k, 1),
        })
    rows.sort(key=lambda r: r["total_reach"], reverse=True)
    return {"niches": rows}


@router.get("/financials")
def financials(_: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    """Roster-wide financial roll-up derived from influencer fees + campaign budgets."""
    influencers = db.execute(select(models.Influencer)).scalars().all()
    base = sum(i.base_rate or 0 for i in influencers)
    code = sum(i.code_gen_fee or 0 for i in influencers)
    mgmt = sum(i.management_fee or 0 for i in influencers)
    agency = sum(i.agency_amount for i in influencers)
    grand_total = sum(i.total_fee for i in influencers)
    count = len(influencers) or 1

    by_tier: dict[str, dict] = {}
    for i in influencers:
        t = i.tier or "Unranked"
        slot = by_tier.setdefault(t, {"tier": t, "count": 0, "total_fee": 0.0})
        slot["count"] += 1
        slot["total_fee"] += i.total_fee
    tier_order = {"Nano": 0, "Micro": 1, "Mid-Tier": 2, "Macro": 3, "Mega": 4, "Unranked": 9}
    tier_rows = sorted(by_tier.values(), key=lambda r: tier_order.get(r["tier"], 9))
    for r in tier_rows:
        r["total_fee"] = round(r["total_fee"], 2)

    top_earners = sorted(influencers, key=lambda i: i.total_fee, reverse=True)[:5]

    campaigns = db.execute(select(models.Campaign)).scalars().all()
    campaign_budget = sum(c.budget or 0 for c in campaigns)
    active_budget = sum(c.budget or 0 for c in campaigns if c.status in {"planning", "active"})

    return {
        "roster_value": round(grand_total, 2),
        "avg_fee": round(grand_total / count, 2),
        "fee_composition": {
            "base_rate": round(base, 2),
            "code_gen_fee": round(code, 2),
            "management_fee": round(mgmt, 2),
            "agency_amount": round(agency, 2),
        },
        "by_tier": tier_rows,
        "top_earners": [
            {"id": i.id, "name": i.name, "tier": i.tier, "total_fee": i.total_fee}
            for i in top_earners
        ],
        "campaign_count": len(campaigns),
        "campaign_budget_total": round(campaign_budget, 2),
        "campaign_budget_active": round(active_budget, 2),
    }


@router.get("/campaign-budgets")
def campaign_budgets(_: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    """Real money flowing through the live campaign workspace (ContentAsset.kols),
    rolled up by brand, lead, and status — the figures finance actually wants."""
    assets = db.execute(select(ContentAsset)).scalars().all()
    brand_names = {b.id: b.name for b in db.execute(select(Brand)).scalars().all()}
    member_names = {m.id: m.name for m in db.execute(select(Member)).scalars().all()}

    def kol_budget(a) -> float:
        return sum(_num(k.get("rate")) + _num(k.get("gen_code_price")) + _num(k.get("boosting_cost"))
                   for k in (a.kols or []))

    total = 0.0
    by_brand: dict[str, float] = {}
    by_lead: dict[str, float] = {}
    by_status: dict[str, float] = {}
    rows = []
    for a in assets:
        b = kol_budget(a)
        total += b
        bn = brand_names.get(a.brand_id) or "No brand"
        by_brand[bn] = by_brand.get(bn, 0.0) + b
        by_status[a.status] = by_status.get(a.status, 0.0) + b
        leads = a.responsible_member_ids or ([a.responsible_member_id] if a.responsible_member_id else [])
        for mid in leads:
            ln = member_names.get(mid)
            if ln:
                by_lead[ln] = by_lead.get(ln, 0.0) + b
        rows.append({
            "id": a.id, "campaign": a.campaign_name, "brand": bn,
            "client": a.client_name, "status": a.status,
            "budget": round(b, 2), "kols": len(a.kols or []),
        })

    def _rank(d, key):
        return sorted(([{key: k, "total": round(v, 2)} for k, v in d.items()]), key=lambda r: -r["total"])

    return {
        "total": round(total, 2),
        "campaign_count": len(assets),
        "by_brand": _rank(by_brand, "brand"),
        "by_lead": _rank(by_lead, "lead"),
        "by_status": _rank(by_status, "status"),
        "campaigns": sorted(rows, key=lambda r: -r["budget"]),
    }


@router.get("/activity")
def activity(limit: int = 20, _: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    """Recent campaign-change activity across the workspace (for the dashboard)."""
    rows = db.query(models.ChangeLog).order_by(models.ChangeLog.created_at.desc()).limit(limit).all()
    return [{"entity": r.entity, "entity_id": r.asset_id, "asset_id": r.asset_id,
             "actor": r.actor, "actor_id": r.actor_id, "action": r.action,
             "summary": r.summary, "detail": r.detail, "at": r.created_at.isoformat() + "Z"} for r in rows]

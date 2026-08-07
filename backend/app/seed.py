"""Seed the database with demo influencers drawn from the design mockups.

Run with:  python -m app.seed
"""
from .content_asset_models import ContentAsset
from .database import SessionLocal, engine
from .directory_models import Brand, Member
from .migrate import run_migrations
from .models import Campaign, Influencer, User
from .security import hash_password
from .services.tiers import tier_for_followers

run_migrations(engine)  # bring schema to head (Alembic) before seeding

DEMO = [
    dict(
        name="Priya Sharma", handle="@priyaglow", age=25,
        avatar_url="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&q=80",
        bio="Former makeup artist turned digital creator. Specializes in luxury "
            "skincare routines, accessible beauty hacks, and aesthetic lifestyle "
            "vlogs. Known for high engagement and authentic community interactions. "
            "Based in London, active since 2019.",
        location="London, UK", active_since="2019",
        niche="Beauty", platform="YouTube, Instagram", verified=True,
        followers=1_200_000, engagement_rate=6.4, growth_30d=2.1,
        platforms=[
            {"platform": "YouTube", "metric": "Subscribers", "value": "850K"},
            {"platform": "Instagram", "metric": "Followers", "value": "350K"},
        ],
        base_rate=150_000, code_gen_fee=15_000, management_fee=22_000,
        agency_fee_pct=15, currency="THB",
        social_links={
            "instagram": "https://instagram.com/priyaglow",
            "youtube": "https://youtube.com/@priyaglow",
            "tiktok": "https://tiktok.com/@priyaglow",
        },
        brand_safety=98, audience_alignment=92, content_quality=89, reliability=95,
        fit_note="High match for premium lifestyle brands.",
        scope_of_work=[
            {"title": "1x Dedicated YouTube Video", "detail": "8-12 minute integrated sponsorship with 60-second product highlight."},
            {"title": "1x Instagram Reel", "detail": "Short-form vertical content focusing on product application/results."},
            {"title": "3x Instagram Stories", "detail": "Behind-the-scenes or unboxing sequence with swipe-up link."},
        ],
        past_campaigns=[
            {"brand": "Beauty Co", "campaign": "Full skincare line promo", "views": "200k", "ctr": "15%",
             "media_url": "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&q=80",
             "media_type": "image", "work_url": "https://youtube.com/@priyaglow"},
            {"brand": "Spa Retreat", "campaign": "Luxury travel vlog", "views": "450k", "ctr": "8%"},
            {"brand": "Luxe Fashion", "campaign": "OOTD Series", "views": "180k", "ctr": "12%"},
            {"brand": "Glow Up", "campaign": "Viral Makeup Tutorial", "views": "1.1M", "ctr": "22%"},
        ],
    ),
    dict(
        name="Elena Rodriguez", handle="@elenastyles", age=27,
        avatar_url="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&q=80",
        bio="Beauty and lifestyle creator with a glowing, approachable aesthetic.",
        location="Madrid, ES", active_since="2018",
        niche="Beauty", platform="Instagram", verified=True,
        followers=1_200_000, engagement_rate=4.8, growth_30d=1.4,
        platforms=[{"platform": "Instagram", "metric": "Followers", "value": "1.2M"}],
        base_rate=120_000, code_gen_fee=12_000, management_fee=18_000,
        agency_fee_pct=12, currency="THB",
        social_links={"instagram": "https://instagram.com/elenastyles"},
        brand_safety=95, audience_alignment=90, content_quality=88, reliability=93,
        fit_note="Strong fit for beauty and skincare launches.",
        scope_of_work=[{"title": "2x Instagram Reels", "detail": "Product-focused short form."}],
        past_campaigns=[{"brand": "Glossier", "campaign": "Spring drop", "views": "320k", "ctr": "9%"}],
    ),
    dict(
        name="Marcus Chen", handle="@marcustech", age=31,
        avatar_url="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80",
        bio="Tech reviewer covering smartphones, gadgets and productivity tools.",
        location="Singapore", active_since="2017",
        niche="Tech", platform="YouTube", verified=True,
        followers=850_000, engagement_rate=5.2, growth_30d=1.9,
        platforms=[{"platform": "YouTube", "metric": "Subscribers", "value": "850K"}],
        base_rate=180_000, code_gen_fee=20_000, management_fee=27_000,
        agency_fee_pct=18, currency="THB",
        social_links={
            "youtube": "https://youtube.com/@marcustech",
            "twitter": "https://x.com/marcustech",
        },
        brand_safety=97, audience_alignment=85, content_quality=94, reliability=96,
        fit_note="Ideal for consumer electronics and SaaS.",
        scope_of_work=[{"title": "1x Review Video", "detail": "10-15 min in-depth review."}],
        past_campaigns=[{"brand": "Samsung", "campaign": "Galaxy unboxing", "views": "1.4M", "ctr": "11%"}],
    ),
    dict(
        name="Sarah Jenkins", handle="@sarahvlogs", age=29,
        avatar_url="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&q=80",
        bio="Lifestyle vlogger capturing travel, food and everyday moments.",
        location="Los Angeles, US", active_since="2016",
        niche="Lifestyle", platform="TikTok, Instagram", verified=True,
        followers=2_400_000, engagement_rate=3.9, growth_30d=0.8,
        platforms=[
            {"platform": "TikTok", "metric": "Followers", "value": "1.6M"},
            {"platform": "Instagram", "metric": "Followers", "value": "800K"},
        ],
        base_rate=210_000, code_gen_fee=18_000, management_fee=30_000,
        agency_fee_pct=15, currency="THB",
        social_links={
            "tiktok": "https://tiktok.com/@sarahvlogs",
            "instagram": "https://instagram.com/sarahvlogs",
        },
        brand_safety=92, audience_alignment=88, content_quality=86, reliability=90,
        fit_note="Great reach for mass-market lifestyle brands.",
        scope_of_work=[{"title": "3x TikTok Videos", "detail": "Trend-driven short form."}],
        past_campaigns=[{"brand": "Airbnb", "campaign": "City series", "views": "2.1M", "ctr": "7%"}],
    ),
    dict(
        name="David Kim", handle="@dkimfit", age=33,
        avatar_url="https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&q=80",
        bio="Fitness coach sharing workout programs and nutrition guidance.",
        location="Seoul, KR", active_since="2015",
        niche="Fitness", platform="Instagram, YouTube", verified=False,
        followers=450_000, engagement_rate=7.1, growth_30d=3.2,
        platforms=[{"platform": "Instagram", "metric": "Followers", "value": "450K"}],
        base_rate=75_000, code_gen_fee=9_000, management_fee=12_000,
        agency_fee_pct=10, currency="THB",
        social_links={
            "instagram": "https://instagram.com/dkimfit",
            "youtube": "https://youtube.com/@dkimfit",
        },
        brand_safety=94, audience_alignment=91, content_quality=83, reliability=88,
        fit_note="High engagement, perfect for supplements and apparel.",
        scope_of_work=[{"title": "1x Workout Reel", "detail": "Product placement in routine."}],
        past_campaigns=[{"brand": "Gymshark", "campaign": "Apparel haul", "views": "380k", "ctr": "18%"}],
    ),
]


DEMO_USERS = [
    dict(username="admin", full_name="Hub Administrator", role="admin", password="admin123"),
    dict(username="viewer", full_name="Client Viewer", role="viewer", password="viewer123"),
]

DEMO_CAMPAIGNS = [
    dict(name="Summer Glow Launch", brand="Beauty Co", status="active",
         objective="Drive awareness for the new skincare line across beauty creators.",
         start_date="2026-06-01", end_date="2026-07-15", budget=450_000, currency="THB",
         influencer_ids=[1, 2], notes="Focus on Reels + dedicated YouTube integration."),
    dict(name="Galaxy Unboxing Series", brand="Samsung", status="planning",
         objective="Tech-focused unboxing and review push for the new flagship.",
         start_date="2026-07-01", end_date="2026-08-01", budget=300_000, currency="THB",
         influencer_ids=[3], notes="Long-form review + shorts."),
    dict(name="FitFest Apparel Drop", brand="Gymshark", status="completed",
         objective="Apparel haul collaboration with fitness creators.",
         start_date="2026-03-01", end_date="2026-04-01", budget=120_000, currency="THB",
         influencer_ids=[5], notes="Completed — 18% CTR on haul reel."),
]


def _seed_users(db) -> int:
    if db.query(User).count() > 0:
        return 0
    db.add_all([
        User(username=u["username"], full_name=u["full_name"], role=u["role"],
             password_hash=hash_password(u["password"]))
        for u in DEMO_USERS
    ])
    db.commit()
    return len(DEMO_USERS)


def ensure_login_accounts() -> int:
    """Create the default login accounts on an empty database (idempotent — a
    no-op once any user exists), so a freshly-provisioned DB is usable straight
    away. Does NOT seed demo influencers/campaigns — those are imported by the
    user. Called on app boot."""
    db = SessionLocal()
    try:
        return _seed_users(db)
    finally:
        db.close()


def _seed_influencers(db) -> int:
    if db.query(Influencer).count() > 0:
        return 0
    db.add_all([
        Influencer(**{**d, "tier": d.get("tier") or tier_for_followers(d.get("followers"))})
        for d in DEMO
    ])
    db.commit()
    return len(DEMO)


def _seed_campaigns(db) -> int:
    if db.query(Campaign).count() > 0:
        return 0
    db.add_all([Campaign(**c) for c in DEMO_CAMPAIGNS])
    db.commit()
    return len(DEMO_CAMPAIGNS)


DEMO_ASSET = dict(
    owner_name="Jarupat Khaohomklin", owner_email="jarupat@team.wkwkp.com",
    client_name="MOLLE", campaign_name="The [In]credible Taste of Artisan",
    period_start="Jan 2026", period_end="June 2026", status="draft",
    tags="beverage, launch, q1",
    description="วัตถุประสงค์: เปิดตัวรสชาติใหม่ · กลุ่มเป้าหมาย: สายปาร์ตี้/มิกซ์เครื่องดื่ม",
    stakeholders="Account Director: ...\nCreative Lead: ...\nClient contact: ...",
    drive_folder_url="https://drive.google.com/drive/folders/EXAMPLE_CAMPAIGN",
    input_files=[
        {"n": "01", "key": "product_info", "title": "Product Information", "synced": "Product_Info", "source": "google_drive", "drive_url": "https://drive.google.com/drive/folders/1O1cfPhcdabaiDEM8LZnE9PR", "thumb": "", "linked": True},
        {"n": "02", "key": "content_direction", "title": "Content Direction", "synced": "Content_Dir", "source": "google_drive", "drive_url": "https://drive.google.com/drive/folders/1Trfm5CsXl8Jlj1DN-HF-jnIy2B", "thumb": "", "linked": True},
        {"n": "03", "key": "ci_design", "title": "CI Design Guidelines", "synced": "CI_Design", "source": "uploaded", "drive_url": "", "thumb": "", "linked": True},
        {"n": "04", "key": "content_category", "title": "Content Category Map", "synced": "Cat_Map", "source": "notion", "drive_url": "", "thumb": "", "linked": True},
    ],
)


DEMO_MEMBERS = [
    dict(name="Jarupat Khaohomklin", email="jarupat@team.wkwkp.com", role="admin", organization="Wakuwaku"),
    dict(name="Champagne", email="jiratthiya@team.wkwkp.com", role="admin", organization="Wakuwaku"),
    dict(name="Beer", email="kritsana@team.wkwkp.com", role="admin", organization="Wakuwaku"),
    dict(name="MOLLE Brand Team", email="contact@molle.co", role="customer", organization="MOLLE"),
    dict(name="Ocean Bites", email="hello@oceanbites.co", role="customer", organization="Ocean Bites Co."),
]
DEMO_BRANDS = [
    dict(name="MOLLE", note="เครื่องดื่ม / mixer"),
    dict(name="Ocean Bites", note="อาหารทะเลแปรรูป"),
]


def _seed_members(db) -> int:
    if db.query(Member).count() > 0:
        return 0
    db.add_all([Member(**m) for m in DEMO_MEMBERS])
    db.commit()
    return len(DEMO_MEMBERS)


def _seed_brands(db) -> int:
    if db.query(Brand).count() > 0:
        return 0
    db.add_all([Brand(**b) for b in DEMO_BRANDS])
    db.commit()
    return len(DEMO_BRANDS)


def _seed_assets(db) -> int:
    if db.query(ContentAsset).count() > 0:
        return 0
    asset = ContentAsset(**DEMO_ASSET)
    # link the demo campaign to the MOLLE brand + an admin lead, if present
    brand = db.query(Brand).filter(Brand.name == "MOLLE").first()
    lead = db.query(Member).filter(Member.email == "jarupat@team.wkwkp.com").first()
    if brand:
        asset.brand_id = brand.id
    if lead:
        asset.responsible_member_id = lead.id
    db.add(asset)
    db.commit()
    return 1


def run():
    db = SessionLocal()
    try:
        u = _seed_users(db)
        i = _seed_influencers(db)
        c = _seed_campaigns(db)
        mem = _seed_members(db)
        br = _seed_brands(db)
        ast = _seed_assets(db)
        parts = []
        if u: parts.append(f"{u} users")
        if i: parts.append(f"{i} influencers")
        if c: parts.append(f"{c} campaigns")
        if mem: parts.append(f"{mem} members")
        if br: parts.append(f"{br} brands")
        if ast: parts.append(f"{ast} content asset")
        print("Seeded " + ", ".join(parts) + "." if parts else "Database already seeded — skipping.")
        if u:
            print("  Default logins: admin/admin123 (admin), viewer/viewer123 (viewer)")
    finally:
        db.close()


if __name__ == "__main__":
    run()

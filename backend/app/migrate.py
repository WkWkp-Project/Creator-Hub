"""Tiny additive migrations for schema changes after the initial release.

`Base.metadata.create_all` only creates *missing tables* — it never adds new
columns to an existing table. For zero-config SQLite dev databases that predate
a column (such as `tier`), we add the column with a plain ``ALTER TABLE`` and
back-fill values. This keeps existing data intact without pulling in Alembic.
"""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from .services.tiers import tier_for_followers


def _alembic_config():
    from alembic.config import Config
    cfg = Config()
    cfg.set_main_option("script_location", str(Path(__file__).resolve().parent.parent / "alembic"))
    return cfg


def run_migrations(engine: Engine) -> None:
    """Bring the schema to head via Alembic. Fresh DBs are built from the
    migrations; a legacy DB created by the old ``create_all`` path is *stamped*
    at head so it adopts Alembic without recreating existing tables."""
    from alembic import command

    tables = set(inspect(engine).get_table_names())
    cfg = _alembic_config()
    if "alembic_version" in tables:
        command.upgrade(cfg, "head")            # already managed → apply new revisions
    elif tables:
        command.stamp(cfg, "head")              # legacy schema → adopt in place
    else:
        command.upgrade(cfg, "head")            # fresh DB → build from migrations


def run_light_migrations(engine: Engine) -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    if "influencers" in tables:
        columns = {col["name"] for col in inspector.get_columns("influencers")}
        with engine.begin() as conn:
            if "tier" not in columns:
                conn.execute(text("ALTER TABLE influencers ADD COLUMN tier VARCHAR(20) DEFAULT ''"))
                # Back-fill tier for every existing row from its follower count.
                rows = conn.execute(text("SELECT id, followers FROM influencers")).fetchall()
                for row_id, followers in rows:
                    conn.execute(
                        text("UPDATE influencers SET tier = :tier WHERE id = :id"),
                        {"tier": tier_for_followers(followers), "id": row_id},
                    )

    # users — email added to link a login account to its directory Member.
    if "users" in tables:
        user_cols = {col["name"] for col in inspector.get_columns("users")}
        with engine.begin() as conn:
            if "email" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN email VARCHAR(160) DEFAULT ''"))
                # Back-fill: if a username is already an email, use it as the email.
                conn.execute(text("UPDATE users SET email = username WHERE email = '' AND username LIKE '%@%'"))
            # organization + position + note folded in from the (now removed) Members page.
            if "organization" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN organization VARCHAR(160) DEFAULT ''"))
            if "position" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN position VARCHAR(120) DEFAULT ''"))
            if "note" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN note TEXT DEFAULT ''"))
            # Back-fill org/note onto each login from its matching Member (by email),
            # so the merge into the single User page loses no directory data.
            if ("organization" not in user_cols or "note" not in user_cols) and "members" in tables:
                conn.execute(text(
                    "UPDATE users SET "
                    "organization = COALESCE((SELECT m.organization FROM members m "
                    "  WHERE lower(m.email) = lower(users.email) AND m.email <> ''), organization), "
                    "note = COALESCE((SELECT m.note FROM members m "
                    "  WHERE lower(m.email) = lower(users.email) AND m.email <> ''), note) "
                    "WHERE users.email <> ''"
                ))

    # brands — logo + owning company added after the table first shipped.
    if "brands" in tables:
        brand_cols = {col["name"] for col in inspector.get_columns("brands")}
        with engine.begin() as conn:
            if "logo_url" not in brand_cols:
                conn.execute(text("ALTER TABLE brands ADD COLUMN logo_url VARCHAR(500) DEFAULT ''"))
            if "company" not in brand_cols:
                conn.execute(text("ALTER TABLE brands ADD COLUMN company VARCHAR(160) DEFAULT ''"))
                # Back-fill each brand's company from an existing campaign's client_name
                # (keeps Company → Brand → Campaign consistent for legacy data).
                if "content_assets" in tables:
                    rows = conn.execute(text(
                        "SELECT brand_id, client_name FROM content_assets "
                        "WHERE brand_id IS NOT NULL AND client_name <> ''"
                    )).fetchall()
                    seen = set()
                    for brand_id, client_name in rows:
                        if brand_id not in seen:
                            seen.add(brand_id)
                            conn.execute(
                                text("UPDATE brands SET company = :c WHERE id = :id AND (company = '' OR company IS NULL)"),
                                {"c": client_name, "id": brand_id},
                            )

    # content_assets — additive columns added after the table first shipped.
    if "content_assets" in tables:
        ca_cols = {col["name"] for col in inspector.get_columns("content_assets")}
        adds = {
            "influencer_ids": "JSON DEFAULT '[]'",
            "brand_id": "INTEGER",
            "responsible_member_id": "INTEGER",
            "responsible_member_ids": "JSON DEFAULT '[]'",
            "kols": "JSON DEFAULT '[]'",
            "sow_options": "JSON DEFAULT '[]'",
            "assigned_user_ids": "JSON DEFAULT '[]'",
            "budget_show": "JSON DEFAULT '{}'",
        }
        with engine.begin() as conn:
            need_resp_backfill = "responsible_member_ids" not in ca_cols
            for col, ddl in adds.items():
                if col not in ca_cols:
                    conn.execute(text(f"ALTER TABLE content_assets ADD COLUMN {col} {ddl}"))
            # Seed the new multi-lead list from the existing single lead so nothing
            # is lost (campaigns that had one responsible member keep them).
            if need_resp_backfill:
                rows = conn.execute(text(
                    "SELECT id, responsible_member_id FROM content_assets "
                    "WHERE responsible_member_id IS NOT NULL"
                )).fetchall()
                for asset_id, mid in rows:
                    conn.execute(
                        text("UPDATE content_assets SET responsible_member_ids = :v WHERE id = :id"),
                        {"v": f"[{int(mid)}]", "id": asset_id},
                    )

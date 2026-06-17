"""Tiny additive migrations for schema changes after the initial release.

`Base.metadata.create_all` only creates *missing tables* — it never adds new
columns to an existing table. For zero-config SQLite dev databases that predate
a column (such as `tier`), we add the column with a plain ``ALTER TABLE`` and
back-fill values. This keeps existing data intact without pulling in Alembic.
"""
from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from .services.tiers import tier_for_followers


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

    # content_assets — additive columns added after the table first shipped.
    if "content_assets" in tables:
        ca_cols = {col["name"] for col in inspector.get_columns("content_assets")}
        adds = {
            "influencer_ids": "JSON DEFAULT '[]'",
            "brand_id": "INTEGER",
            "responsible_member_id": "INTEGER",
        }
        with engine.begin() as conn:
            for col, ddl in adds.items():
                if col not in ca_cols:
                    conn.execute(text(f"ALTER TABLE content_assets ADD COLUMN {col} {ddl}"))

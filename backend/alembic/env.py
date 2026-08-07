"""Alembic environment — wired to the app's metadata + DATABASE_URL.

Importing every model module ensures Base.metadata is fully populated so
autogenerate sees all tables. The URL comes from the app (already normalised,
e.g. Render's postgres:// → postgresql+psycopg2://).
"""
from logging.config import fileConfig

from alembic import context

from app.database import DATABASE_URL, Base, engine
# Import all model modules so their tables register on Base.metadata.
from app import models  # noqa: F401
from app import content_asset_models  # noqa: F401
from app import directory_models  # noqa: F401
from app import content_models  # noqa: F401

config = context.config
if config.config_file_name is not None:
    try:
        fileConfig(config.config_file_name)
    except Exception:
        pass

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # SQLite can't ALTER in place — batch mode rewrites tables for it.
            render_as_batch=connection.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

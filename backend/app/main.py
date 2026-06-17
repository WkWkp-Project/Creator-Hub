"""Creator Hub — FastAPI application entrypoint."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from .config import get_settings
from .database import Base, engine
from .migrate import run_light_migrations
from .routers import auth, backup, campaigns, content, content_asset, directory, imports, influencers, stats, uploads

settings = get_settings()

# --- Production safety guards -------------------------------------------------
# Fail fast on insecure configuration when ENVIRONMENT=production so a misconfig
# can never silently ship with forgeable tokens or an open CORS policy.
if settings.is_production:
    if settings.using_default_secret:
        raise RuntimeError(
            "SECRET_KEY is still the development default. Set a strong SECRET_KEY "
            "env var before running in production."
        )
    if settings.origins == ["*"]:
        raise RuntimeError(
            "CORS_ORIGINS is '*' in production. Set it to your exact frontend "
            "origin(s), e.g. CORS_ORIGINS=https://app.yourdomain.com"
        )
elif settings.using_default_secret:
    # Dev convenience, but make the risk visible in logs.
    print("[WARN] Using the default development SECRET_KEY — do NOT use in production.")

# Create tables on startup (simple bootstrap; use Alembic for real migrations).
Base.metadata.create_all(bind=engine)
# Add columns introduced after the initial schema (e.g. `tier`) to existing DBs.
run_light_migrations(engine)

app = FastAPI(title=settings.app_name, version=settings.app_version)

# Auth uses bearer tokens (not cookies), so credentials need not be allowed —
# this keeps a wildcard origin valid for local dev while staying safe.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(influencers.router)
app.include_router(campaigns.router)
app.include_router(imports.router)
app.include_router(stats.router)
app.include_router(uploads.router)
app.include_router(backup.router)
app.include_router(content.router)
app.include_router(content_asset.router)
app.include_router(directory.router)


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok", "service": settings.app_name, "version": settings.app_version}


# Serve user-uploaded media (avatars + campaign media).
if uploads.UPLOAD_ROOT.is_dir():
    app.mount("/uploads", StaticFiles(directory=str(uploads.UPLOAD_ROOT)), name="uploads")

# Optionally serve the static frontend when bundled in the same container.
# Resolution order:
#   1. FRONTEND_DIR env var (set in Docker to /app/frontend)
#   2. the repo's ../../frontend folder relative to this file (local dev)
_repo_frontend = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
)
_frontend_dir = os.environ.get("FRONTEND_DIR") or _repo_frontend
if os.path.isdir(_frontend_dir):
    app.mount("/", StaticFiles(directory=_frontend_dir, html=True), name="frontend")

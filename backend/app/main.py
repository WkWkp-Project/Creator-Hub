"""Creator Hub — FastAPI application entrypoint."""
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from .config import get_settings
from .database import Base, engine
from .migrate import run_migrations
from .observability import (
    RequestContextMiddleware, configure_logging, db_ready, init_sentry, log,
)
from .routers import auth, backup, campaigns, content, content_asset, directory, imports, influencers, settings as settings_router, stats, uploads

settings = get_settings()

# Observability: structured JSON logs + optional Sentry, set up before anything else.
configure_logging(os.environ.get("LOG_LEVEL", "INFO"))
init_sentry(os.environ.get("SENTRY_DSN", ""), settings.environment)

# --- Production safety guards -------------------------------------------------
# Fail fast on insecure configuration when ENVIRONMENT=production so a misconfig
# can never silently ship with forgeable tokens or an open CORS policy.
if settings.is_production:
    if settings.secret_policy_error:
        raise RuntimeError(
            settings.secret_policy_error + " Set a strong SECRET_KEY env var "
            "before running in production."
        )
    if settings.origins == ["*"]:
        raise RuntimeError(
            "CORS_ORIGINS is '*' in production. Set it to your exact frontend "
            "origin(s), e.g. CORS_ORIGINS=https://app.yourdomain.com"
        )
    if settings.database_url.strip().lower().startswith("sqlite"):
        raise RuntimeError(
            "Refusing to run in production on SQLite — its single-writer locking "
            "breaks under concurrency and file storage is usually ephemeral (data "
            "loss on redeploy). Set DATABASE_URL=postgresql+psycopg2://… for production."
        )
elif settings.using_default_secret:
    # Dev convenience, but make the risk visible in logs.
    log.warning("Using the default development SECRET_KEY — do NOT use in production.")

# Bring the schema to head via Alembic (creates a fresh DB, stamps a legacy one,
# or applies new revisions to an already-managed DB).
run_migrations(engine)

app = FastAPI(title=settings.app_name, version=settings.app_version)

# Request-id + structured access logging (added after CORS so it wraps it).
app.add_middleware(RequestContextMiddleware)


@app.middleware("http")
async def security_headers(request, call_next):
    """Apply request guard rails + conservative browser security headers."""
    response = None
    if request.method in {"POST", "PUT", "PATCH"}:
        media_type = (request.headers.get("content-type") or "").split(";", 1)[0].strip().lower()
        is_json = media_type == "application/json" or media_type.endswith("+json")
        try:
            content_length = int(request.headers.get("content-length") or "0")
        except ValueError:
            content_length = 0
        max_json_bytes = max(1, settings.max_json_body_mb) * 1024 * 1024
        if is_json and content_length > max_json_bytes:
            response = Response(
                content=f'{{"detail":"JSON body exceeds {settings.max_json_body_mb}MB limit."}}',
                status_code=413,
                media_type="application/json",
            )
    if response is None:
        response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
        response.headers.setdefault("Pragma", "no-cache")
    elif request.query_params.get("v"):
        # Frontend assets use explicit cache-busting versions (?v=N). Keep those
        # immutable so repeat visits avoid re-downloading the large JS/CSS files.
        response.headers.setdefault("Cache-Control", "public, max-age=31536000, immutable")
    if settings.is_production:
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response

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
app.include_router(uploads.files_router)   # public /uploads/... served from the DB
app.include_router(backup.router)
app.include_router(content.router)
app.include_router(content_asset.router)
app.include_router(directory.router)
app.include_router(settings_router.router)


@app.get("/api/health", tags=["meta"])
def health():
    """Liveness — the process is up (does not touch the DB)."""
    return {"status": "ok", "service": settings.app_name, "version": settings.app_version}


@app.get("/api/ready", tags=["meta"])
def ready(response: Response):
    """Readiness — the process can actually serve (DB reachable). 503 if not, so a
    load balancer stops routing to a broken instance."""
    if db_ready(engine):
        return {"status": "ready", "database": "ok"}
    response.status_code = 503
    return {"status": "not_ready", "database": "unavailable"}


# User-uploaded media (avatars + campaign media) is served from the DB by
# uploads.files_router (registered above) so it survives an ephemeral filesystem.

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

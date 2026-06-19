# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Creator Hub — single production image (FastAPI API + baked-in frontend).
# Runs on any Docker host / PaaS: Render, Railway, Fly.io, Hugging Face Spaces.
# Build context = repo root (influencer-hub/).  Also used by docker-compose.yml.
#
# A fresh deploy defaults to the zero-config SQLite DB with auto-seeded demo data
# (login: admin / admin123). For real use, set DATABASE_URL (Postgres),
# ENVIRONMENT=production and a strong SECRET_KEY — see docs/DEPLOYMENT.md.
# ─────────────────────────────────────────────────────────────────────────────
ARG PYTHON_VERSION=3.12

# ── Stage 1 — build dependencies into an isolated virtualenv ─────────────────
FROM python:${PYTHON_VERSION}-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH

RUN python -m venv "$VIRTUAL_ENV"

# Copy only the lockfile first so this layer caches until deps actually change.
COPY backend/requirements.txt .
RUN pip install -r requirements.txt

# ── Stage 2 — lean runtime image ─────────────────────────────────────────────
FROM python:${PYTHON_VERSION}-slim AS runtime

LABEL org.opencontainers.image.title="Creator Hub" \
      org.opencontainers.image.description="Influencer & campaign management (FastAPI + vanilla JS)" \
      org.opencontainers.image.source="https://github.com/WkWkp-Project/Ads--Tracker"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    FRONTEND_DIR=/app/frontend

WORKDIR /app

# Bring in the prebuilt virtualenv — no pip cache or build tooling in the runtime.
COPY --from=builder /opt/venv /opt/venv

# Application code + baked frontend.
COPY backend/app ./app
COPY frontend ./frontend

# Drop root: run as an unprivileged user and pre-create the writable dirs
# (SQLite DB, uploads, local backups) so they belong to that user.
RUN useradd --create-home --uid 10001 appuser \
 && mkdir -p /app/uploads /app/backups \
 && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Liveness probe against the app's own /api/health (no curl/wget in slim images).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:'+os.getenv('PORT','8000')+'/api/health').status==200 else 1)"

# Seed (idempotent) then serve; bind to the platform-provided $PORT when present.
CMD ["sh", "-c", "python -m app.seed && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-1}"]

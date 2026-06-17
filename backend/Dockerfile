FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps for psycopg2 / pandas wheels are already bundled; keep image lean.
# psycopg2-binary is installed here (not in requirements.txt) because it is only
# needed for the Postgres path used in this image — local SQLite dev skips it.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt psycopg2-binary>=2.9.10

COPY app ./app

# The frontend is copied in by docker-compose (mounted) or baked here for a
# single-container deploy. main.py serves it from FRONTEND_DIR when present.
ENV FRONTEND_DIR=/app/frontend

EXPOSE 8000

# Seed once, then serve with WEB_CONCURRENCY workers (default 2).
# `python -m app.seed` is idempotent (skips entities that already exist).
CMD ["sh", "-c", "python -m app.seed && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY:-2}"]

# Single-image deploy build (frontend baked in) for PaaS like Render / Railway /
# Fly.io / Hugging Face Spaces. Build context = repo root.
#
# Defaults to the zero-config SQLite database + auto-seeded demo data, so a fresh
# deploy immediately shows a working demo (login admin / admin123). For a real
# deployment set DATABASE_URL (Postgres), ENVIRONMENT=production and SECRET_KEY.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    FRONTEND_DIR=/app/frontend

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt psycopg2-binary>=2.9.10

COPY backend/app ./app
COPY frontend ./frontend

EXPOSE 8000

# Seed (idempotent) then serve. Bind to the platform-provided $PORT when present.
CMD ["sh", "-c", "python -m app.seed && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-1}"]

#!/usr/bin/env bash
# One-time / per-deploy setup. Run from the repo root (the influencer-hub folder).
# As the Plesk subscription user. Idempotent — safe to re-run after each git pull.
set -euo pipefail
cd "$(dirname "$0")/.."

# 1) Python venv + dependencies (psycopg2-binary installs on Python 3.10–3.13).
if [ ! -d .venv ]; then python3 -m venv .venv; fi
./.venv/bin/pip install --upgrade pip --quiet
./.venv/bin/pip install -r backend/requirements.txt --quiet

# 2) Migrations run automatically when the app boots (Alembic), so nothing to do
#    here. To run them by hand:  cd backend && ../.venv/bin/python -m alembic upgrade head

echo "setup OK — (re)start the service:  sudo systemctl restart creator-hub"

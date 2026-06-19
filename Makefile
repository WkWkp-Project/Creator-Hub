.PHONY: install install-dev dev seed test up down logs sample

# ── Local dev (SQLite, no Docker) ────────────────────────────────────────────
install:        ## runtime deps only
	cd backend && . .venv/bin/activate && pip install -r requirements.txt
install-dev:    ## runtime + test deps
	cd backend && . .venv/bin/activate && pip install -r requirements-dev.txt
dev:
	cd backend && . .venv/bin/activate && uvicorn app.main:app --reload --port 8000
seed:
	cd backend && . .venv/bin/activate && python -m app.seed
test:
	cd backend && . .venv/bin/activate && pytest -q

# ── Docker ───────────────────────────────────────────────────────────────────
up:
	docker compose up --build
down:
	docker compose down
logs:
	docker compose logs -f backend

# ── Utilities ────────────────────────────────────────────────────────────────
# Regenerate the xlsx sample from the csv
sample:
	cd backend && . .venv/bin/activate && python ../scripts/make_sample_xlsx.py

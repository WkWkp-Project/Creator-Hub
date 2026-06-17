.PHONY: dev seed up down logs sample test
# Local dev (SQLite, no Docker)
dev:
	cd backend && . .venv/bin/activate && uvicorn app.main:app --reload --port 8000
seed:
	cd backend && . .venv/bin/activate && python -m app.seed
# Docker
up:
	docker compose up --build
down:
	docker compose down
logs:
	docker compose logs -f backend
# Regenerate the xlsx sample from the csv
sample:
	cd backend && . .venv/bin/activate && python ../scripts/make_sample_xlsx.py

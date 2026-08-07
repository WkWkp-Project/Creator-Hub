> 👉 **เพิ่งมาทำต่อ? อ่าน [`HANDOFF.md`](HANDOFF.md) ก่อน** — สรุปสั้น ตรงปัจจุบัน (วิธีรัน, roles, สถาปัตยกรรม, แผนที่ไฟล์).
> README ด้านล่างเป็นภาพรวมเดิม บางส่วนยังไม่อัปเดตตามฟีเจอร์ล่าสุด (3 roles, Content-Asset campaign suite, การรวมหน้า User/Member).

# Creator Hub — Influencer Database & Management Dashboard

A bright, enterprise-grade dashboard for managing an influencer/creator roster:
profiles, audience metrics, the full **fee breakdown** (ค่าตัว / ค่าเจนโค้ด /
ค่าเมเนจฟี / ค่าเอเจนฟี — charged as a **percentage**), clickable **social links**
shown as platform icons, past-campaign history, suitability scoring, an
**Export to Excel** button, and a spreadsheet **auto-import** that maps Excel/CSV
columns to system fields automatically — including Thai headers. All amounts are
in **Thai Baht (฿)**.

Built on the **"Luminous Influence"** design system (Corporate Modern,
high-clarity, light-first).

---

## ✨ Features

| Area | What it does |
|------|--------------|
| **Accounts & roles** | Login-gated app with two roles: **admin** (full control) and **viewer** (read-only client). Admin-only controls are hidden for viewers and enforced on the server. Manage users + passwords from Settings. |
| **Campaigns** | Full CRUD campaign manager — name, brand, status (planning/active/completed/cancelled), dates, budget, objective, and assigned influencers. Detail view rolls up the assigned roster. |
| **Financials** | Roster-wide money view: total roster value, average fee, **fee composition** (base/code-gen/management/agency), value by tier, top earners, and campaign-budget totals. |
| **Directory** | Card grid of creators with avatar, **tier badge**, niche chip, followers, engagement rate. Filter by **tier** / platform / niche / price range (฿) + live search. |
| **Tiers** | Every creator is graded **Nano / Micro / Mega**, auto-derived from follower count (and overridable in the form). Filter the directory by tier and see the tier breakdown in Analytics. |
| **Profile detail** | Bio, age, location, verified badge, tier badge, total reach, per-platform stats, clickable **social link icons**, **Typical Scope of Work**, **Financial Breakdown** (base + code-gen + management → subtotal, **agency fee as %** → amount, grand total in ฿), **Past Campaigns with media** (image/video thumbnail + work link), and AI-style **Campaign Fit** scores. |
| **Add / Edit** | Full create + update form for every field: **profile-picture upload** (or paste a URL), a **Tier** selector (Auto from followers, or set manually), a **Social Links** section, and a **Past Campaigns** editor where each campaign can carry an **uploaded image/video or a link** plus a work link. |
| **Auto Import** | Upload `.csv` / `.xlsx` / `.xls` → columns are fuzzy-matched to system fields (TH + EN aliases, incl. social-link and agency-% columns) → review/adjust → bulk upsert. Messy values like `1.2M`, `฿95,000`, `4.8%` are normalised automatically. |
| **Export** | One click downloads the whole roster as an Excel file with Thai/English headers that **re-import cleanly** (round-trip safe). CSV also available. |
| **Analytics** | Roster totals, verified count, average engagement, total reach, breakdown by niche & platform. |

---

## 🏗 Tech Stack

```
Frontend   Vanilla JS SPA + Tailwind (CDN) — zero build step, design-token exact
Fonts      Prompt (core, full Thai support) + Poppins (Latin display accents)
Backend    FastAPI (Python 3.12) + SQLAlchemy 2.0 + Pydantic v2
Matching   pandas + openpyxl (parsing) · rapidfuzz (fuzzy column matching)
Database   SQLite (dev, zero-config) · PostgreSQL (Docker / prod)
Container  Docker + docker-compose
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full breakdown.

---

## 🚀 Quick Start

### Option A — Docker (recommended)

```bash
docker compose up --build
```

Then open **http://localhost:8000**. The API and the UI are served from the
same origin; Postgres comes up automatically and the database is seeded with
demo creators on first boot.

### Option B — Local (SQLite, no Docker)

**macOS / Linux**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.seed                 # load demo data (idempotent)
uvicorn app.main:app --reload      # http://localhost:8000
```

**Windows (PowerShell)**

```powershell
cd backend
py -m venv .venv ; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m app.seed                 # load demo data (idempotent)
uvicorn app.main:app --reload      # http://localhost:8000
```

> Requires Python 3.12–3.14. The PostgreSQL driver (`psycopg2-binary`) is **not**
> installed locally — it is only needed for the Docker/Postgres path. Local dev
> uses the bundled zero-config SQLite database.

The backend serves the `frontend/` folder automatically (resolved relative to
the repo, or via the `FRONTEND_DIR` env var), so visiting
`http://localhost:8000` shows the full app. API docs live at
`http://localhost:8000/docs` (Swagger UI).

**Default logins** (created by the seeder — change them in production):

| Username | Password | Role |
|----------|----------|------|
| `admin`  | `admin123`  | admin (full control) |
| `viewer` | `viewer123` | viewer (read-only client) |

> Set a strong `SECRET_KEY` env var in production — it signs the session tokens.

---

## 📥 Trying the Import

Two ready-made files live in [`sample_data/`](sample_data/):

- `influencers_sample.csv` — mixed Thai/English headers, all map cleanly.
- `influencers_sample.xlsx` — includes one intentionally unmatched column
  (`Internal Ref`) so you can see the *Unmapped* state.

Click **Import Data** in the sidebar, drop a file, review the auto-mapping, and
hit **Process Import**. Full walkthrough in
[`docs/IMPORT_GUIDE.md`](docs/IMPORT_GUIDE.md).

---

## 📁 Project Structure

```
influencer-hub/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app + static frontend/uploads mounts
│   │   ├── config.py          # env-driven settings (incl. SECRET_KEY)
│   │   ├── database.py        # engine + session
│   │   ├── migrate.py         # light additive migrations (e.g. tier column)
│   │   ├── security.py        # password hashing + signed tokens (stdlib)
│   │   ├── deps.py            # auth dependencies (get_current_user/require_admin)
│   │   ├── models.py          # Influencer · User · Campaign ORM models
│   │   ├── schemas.py         # Pydantic request/response models
│   │   ├── crud.py            # DB queries + filtering
│   │   ├── seed.py            # demo data loader (users + influencers + campaigns)
│   │   ├── routers/
│   │   │   ├── auth.py        # login + user management
│   │   │   ├── influencers.py # CRUD + filters (+ tier)
│   │   │   ├── campaigns.py   # campaign CRUD
│   │   │   ├── imports.py     # preview + commit (auto-matching)
│   │   │   ├── uploads.py     # avatar + campaign media uploads
│   │   │   └── stats.py       # analytics + niche-performance + financials
│   │   └── services/
│   │       ├── column_matcher.py  # fuzzy header matching + value parsing
│   │       └── tiers.py           # Nano/Micro/Mega thresholds
│   ├── tests/test_app.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── index.html            # app shell (sidebar, topbar, design tokens)
│   └── assets/
│       ├── app.js            # SPA router, rendering, import wizard
│       └── styles.css        # supplementary styles
├── sample_data/              # example CSV + XLSX
├── scripts/make_sample_xlsx.py
├── docs/                     # 📚 document library — start at docs/README.md
│   ├── README.md             #   index / catalog + maintenance guide
│   ├── ARCHITECTURE.md · API.md · AUTH_AND_ROLES.md
│   ├── IMPORT_GUIDE.md · QA_REPORT.md · CHANGELOG.md
├── docker-compose.yml
├── Makefile
└── README.md
```

📚 **Documentation:** the full document library lives in
[`docs/`](docs/README.md) — start at its index for architecture, API reference,
auth & roles, the import guide, the QA report, and the changelog.

---

## 🔌 API Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/login` | log in → `{token, user}` |
| GET | `/api/auth/me` | current user |
| GET/POST/DELETE | `/api/auth/users…` | manage users (admin) |
| GET | `/api/campaigns` | list + filter (`search,status`) |
| POST/PUT/DELETE | `/api/campaigns/{id}` | campaign CRUD (admin) |
| GET | `/api/stats/niche-performance` | per-niche comparison |
| GET | `/api/stats/financials` | financial roll-up |
| GET | `/api/influencers` | list + filter (`search,platform,niche,min_price,max_price,tier,sort`) |
| POST | `/api/influencers` | create |
| GET | `/api/influencers/{id}` | detail |
| PUT | `/api/influencers/{id}` | update |
| DELETE | `/api/influencers/{id}` | remove |
| GET | `/api/influencers?...&tier=Nano\|Micro\|Mega` | filter by audience tier |
| GET | `/api/influencers/export?format=xlsx\|csv` | download roster (re-importable) |
| POST | `/api/uploads/avatar` | upload a profile picture → `{url}` |
| POST | `/api/uploads/campaign-media` | upload campaign image/video → `{url, media_type}` |
| GET | `/api/imports/system-fields` | mappable field catalogue |
| POST | `/api/imports/preview` | upload file → auto-matched column map |
| POST | `/api/imports/commit` | confirm map → bulk upsert |
| GET | `/api/stats` | dashboard aggregates |
| GET | `/api/health` | liveness |

Full reference: [`docs/API.md`](docs/API.md).

---

## 🧪 Tests

```bash
cd backend && source .venv/bin/activate
pytest -q
```

Covers the column matcher (EN + TH), value coercion, false-positive guards, and
the influencer CRUD lifecycle.

---

## ⚙️ Configuration

Set via environment (or `backend/.env`, see `backend/.env.example`):

| Var | Default | Notes |
|-----|---------|-------|
| `DATABASE_URL` | `sqlite:///./creatorhub.db` | use `postgresql+psycopg2://…` for prod |
| `CORS_ORIGINS` | `*` | comma-separated origins |
| `MAX_UPLOAD_MB` | `10` | import file size cap |
| `ALLOWED_EXTENSIONS` | `.csv,.xlsx,.xls` | accepted import types |

---

## 🏷 Audience Tiers

Tiers are derived from follower count (Thai-market convention), centralised in
[`backend/app/services/tiers.py`](backend/app/services/tiers.py):

| Tier | Followers |
|------|-----------|
| **Nano** | `< 10,000` |
| **Micro** | `10,000 – 999,999` |
| **Mega** | `≥ 1,000,000` |

The tier is auto-filled on create/update/import when not set, but the Add/Edit
form lets you override it manually. Adjust the two thresholds (`NANO_MAX`,
`MEGA_MIN`) in that one file to retune every tier across the app.

---

## 🗂 Uploads

Profile pictures and campaign media are stored under `backend/uploads/`
(`avatars/`, `campaigns/`) and served at `/uploads/...`. Uploads are validated by
extension, content-type, **and magic-byte signature**. You can always paste an
external `http(s)` URL instead of uploading.

---

## 🛣 Roadmap ideas

- Authentication & role-based access
- Campaign & financials modules (sidebar links are stubbed)
- Alembic migrations (currently `create_all` on boot)
- Export to PDF media kit
- Saved import templates per data source

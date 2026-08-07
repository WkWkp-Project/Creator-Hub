# Deploy on Plesk (Git + admin)

FastAPI serves the API **and** the static frontend on one port, and runs the DB
migrations itself on boot. So the whole app is one process behind Plesk's proxy.
Helper files live in [`deploy/`](../deploy/).

Paths below assume the repo is deployed to
`/var/www/vhosts/<domain>/creator-hub/influencer-hub` (the folder that contains
`backend/` and `frontend/`). Adjust to wherever Plesk Git put it.

## 1. PostgreSQL (required — prod refuses SQLite)
Plesk → **Databases → Add Database** → type **PostgreSQL**. Note host, db name,
user, password. You'll put them in `DATABASE_URL` (step 4).

## 2. Pull the code with Plesk Git
Plesk → your domain → **Git** → add the repository
`https://github.com/WkWkp-Project/Creator-Hub`, branch **Patch-1** (or `Main`
after you merge). Set the deployment path to `creator-hub`. Deploy/pull once.

In **Git → Repository settings → Additional deployment actions**, add:
```
bash influencer-hub/deploy/setup.sh
sudo systemctl restart creator-hub
```
(So every future `git pull` re-installs deps and restarts the app. The
`systemctl` line needs a sudoers rule — see step 6.)

## 3. Python venv + dependencies (one time, over SSH as the subscription user)
```
cd /var/www/vhosts/<domain>/creator-hub/influencer-hub
bash deploy/setup.sh
```
> Requires Python 3.10–3.13 (psycopg2-binary has no 3.14 wheel). `python3 --version`.

## 4. Environment file
Copy the template and fill it in:
```
cp deploy/env.production.example backend/.env
nano backend/.env
```
Set `DATABASE_URL` (the Plesk Postgres), `SECRET_KEY` (`openssl rand -hex 32`),
`CORS_ORIGINS` (your exact https origin), `ENVIRONMENT=production`. Missing any of
these = the app refuses to boot (by design).

Quick boot test (should print JSON logs + "Application startup complete"):
```
.venv/bin/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8020
```
Ctrl-C once it's up.

## 5. Run it as a service (as root)
```
cp deploy/creator-hub.service /etc/systemd/system/creator-hub.service
# edit __DOMAIN__ + __SYSUSER__ (the subscription's system user) inside it
systemctl daemon-reload
systemctl enable --now creator-hub
systemctl status creator-hub          # should be active (running)
curl -s localhost:8020/api/ready      # {"status":"ready","database":"ok"}
```

## 6. Let the deploy action restart the service (as root)
```
echo '<SYSUSER> ALL=(root) NOPASSWD: /usr/bin/systemctl restart creator-hub' \
  > /etc/sudoers.d/creator-hub
chmod 440 /etc/sudoers.d/creator-hub
```

## 7. Reverse proxy + SSL (Plesk)
Plesk → domain → **Apache & nginx Settings**:
- Paste [`deploy/plesk-nginx-proxy.conf`](../deploy/plesk-nginx-proxy.conf) into
  **Additional nginx directives**.
- **Untick** "Proxy mode" and "Smart static files processing" (the app serves its
  own static files + `/uploads`).
- Apply. Then issue **Let's Encrypt** SSL for the domain.

Open `https://app.yourdomain.com` → log in `admin / admin123` → **change it
immediately** (Settings → your account). The seeded default is dev-only.

## Notes / gotchas
- **Health checks:** `/api/health` (liveness), `/api/ready` (checks the DB → 503 if down).
- **Uploads** live in `backend/uploads/` on disk — make sure that path persists and
  is writable by the service user. (Not wiped by git pull.)
- **One worker** is configured so the in-memory login throttle + account lockout
  stay correct. To run multiple workers, move those to Redis first.
- **Migrations** auto-apply on each boot (Alembic). New migrations ship in the repo;
  a normal deploy (pull → restart) applies them.
- **Logs:** `journalctl -u creator-hub -f` (structured JSON, with request ids).
- **Backups:** prefer Plesk's managed PostgreSQL backups; the in-app backup is a
  local-disk safety net, not off-site.

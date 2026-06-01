# Production Deployment Guide

This guide covers the most common path: a single Linux VM running nginx + the
backend (managed by PM2) with PostgreSQL on a separate host. It also notes the
Windows alternative at the end.

> The frontend ends up as **plain static files** served by nginx. The backend
> only handles `/api/*`. There is no Vite dev server in production.

---

## 1. Server prerequisites

On a fresh Ubuntu 22.04 / 24.04 server:

```bash
sudo apt update
sudo apt install -y curl git nginx postgresql-client

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PM2 process manager
sudo npm install -g pm2

# (Optional) HTTPS via Let's Encrypt
sudo apt install -y certbot python3-certbot-nginx
```

Create a non-root user that will own the app:

```bash
sudo adduser --system --group --home /srv/rpa-planning rpa
sudo mkdir -p /srv/rpa-planning /var/www/rpa-planning
sudo chown -R rpa:rpa /srv/rpa-planning /var/www/rpa-planning
```

## 2. Get the code onto the server

```bash
sudo -u rpa -H bash -lc '
  cd /srv/rpa-planning
  git clone <your repo URL> .   # or rsync from your workstation
  npm install
  npm run install:all
'
```

## 3. Production `.env`

```bash
sudo -u rpa -H cp /srv/rpa-planning/backend/.env.example /srv/rpa-planning/backend/.env
sudo -u rpa -H nano /srv/rpa-planning/backend/.env
```

Set:

```
PGHOST=<database-host>
PGPORT=5432
PGUSER=<database-user>
PGPASSWORD="<database-password>"
PGDATABASE=rpa_planning

PORT=6000
JWT_SECRET=<paste a long random string here>
JWT_EXPIRES_IN=8h
CORS_ORIGIN=https://rpa.example.com

TENANTADMIN_USERNAME=tenantadmin
TENANTADMIN_PASSWORD=<change before first start>
SUPERADMIN_USERNAME=superadmin
SUPERADMIN_PASSWORD=<change before first start>
```

Generate a JWT secret on the server:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

## 4. Initialize the production database

```bash
PGPASSWORD='<database-password>' psql -h <database-host> -U <database-user> -d postgres -c "CREATE DATABASE rpa_planning;"
PGPASSWORD='<database-password>' psql -h <database-host> -U <database-user> -d rpa_planning \
    -f /srv/rpa-planning/backend/sql/schema.sql
# Optional one-time migration from the legacy Excel file:
sudo -u rpa -H node /srv/rpa-planning/backend/scripts/migrateFromExcel.js \
    "/srv/rpa-planning/RPA SV Summary - 2026.xlsx"
PGPASSWORD='<database-password>' psql -v ON_ERROR_STOP=1 -h <database-host> -U <database-user> -d rpa_planning \
    -f /srv/rpa-planning/backend/sql/migration.sql
```

## 5. Build the frontend

```bash
sudo -u rpa -H bash -lc '
  cd /srv/rpa-planning/frontend
  # Vite proxy is dev-only; production hits /api/* on the same host
  npm run build
'
sudo rsync -a --delete /srv/rpa-planning/frontend/dist/ /var/www/rpa-planning/
```

Re-run those two commands every time you deploy a new version of the frontend.

## 6. Start the backend with PM2

```bash
sudo -u rpa -H bash -lc '
  cd /srv/rpa-planning
  pm2 start deploy/ecosystem.config.cjs --env production
  pm2 save
'
# Make pm2 boot the backend on system start. The command prints a `sudo`
# instruction; copy-paste it.
sudo -u rpa -H pm2 startup systemd -u rpa --hp /srv/rpa-planning
```

The backend now listens on `127.0.0.1:6000`. nginx is what exposes it to the world.

> **systemd alternative**: if you'd rather not run PM2, copy
> `deploy/rpa-backend.service` into `/etc/systemd/system/` and run
> `sudo systemctl enable --now rpa-backend`. Skip the PM2 steps in that case.

## 7. nginx + HTTPS

```bash
# Edit deploy/nginx.conf — change `server_name` to your real hostname
sudo cp /srv/rpa-planning/deploy/nginx.conf /etc/nginx/sites-available/rpa-planning
sudo ln -sf /etc/nginx/sites-available/rpa-planning /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# (Optional) get a TLS cert
sudo certbot --nginx -d rpa.example.com
```

Visit `https://rpa.example.com`. You should see the dashboard.
Login: `superadmin` / the password you set in `.env` — change it on first sign-in.

## 8. Updating later

```bash
sudo -u rpa -H bash -lc '
  cd /srv/rpa-planning
  git pull
  npm run install:all
  cd frontend && npm run build
'
sudo rsync -a --delete /srv/rpa-planning/frontend/dist/ /var/www/rpa-planning/
sudo -u rpa -H pm2 restart rpa-planning-backend
```

---

## Production hardening checklist

- [ ] Rotate the default `superadmin` password (forced on first login).
- [ ] Set a real `JWT_SECRET` — never ship the example value.
- [ ] Restrict PostgreSQL: in `pg_hba.conf`, allow only the app's IP (not `0.0.0.0/0`).
- [ ] Confirm `CORS_ORIGIN` matches your production hostname.
- [ ] Take a `pg_dump` schedule (cron + retention).
- [ ] Add a firewall rule allowing only 80/443 publicly; backend's 6000 stays bound to localhost.
- [ ] Configure log rotation: `sudo pm2 install pm2-logrotate`.
- [ ] If using Gmail SMTP, generate an [App Password](https://myaccount.google.com/apppasswords) and save it in **Admin → SMTP** (the password is encrypted at rest only by Postgres' file permissions, so keep DB access locked).

## Troubleshooting

| Symptom | What to check |
|---|---|
| 502 from nginx | `pm2 logs rpa-planning-backend`, then `curl localhost:6000/api/health` |
| `SCRAM-SERVER-FIRST-MESSAGE` | Confirm `PGPASSWORD` is correct; quote it in `.env` when it contains shell-sensitive characters |
| Frontend loads but API errors with 401 | `JWT_SECRET` mismatch between deploys → re-login |
| Build OK but pages show stale CSS | Browser hard-refresh; or bump cache-busting by re-deploying frontend |
| `EADDRINUSE :5000` | Another process owns port 5000; check `PORT` in `.env` (we use 6000) |

---

## Windows Server alternative

If you prefer to deploy on Windows Server (IIS):

1. Install Node.js 20 LTS and PostgreSQL client.
2. Install **iisnode** or use **httpPlatformHandler** to host the Express app.
3. Build the frontend with `npm run build`; copy `frontend/dist` to `C:\inetpub\wwwroot\rpa-planning`.
4. Configure IIS URL Rewrite so `/api/*` proxies to `http://127.0.0.1:6000` and everything else falls back to `index.html`.
5. Use **NSSM** (`nssm install rpa-backend`) to run `node src/server.js` as a Windows service.

The configuration shape is the same as the Linux setup — just swap nginx → IIS and PM2 → NSSM.

# tdoggie.com deployment guide

This is the reusable, public-safe playbook for deploying small apps to the
`tdoggie.com` VPS. It intentionally documents operational structure and
deployment conventions, but it must not contain secret values such as passwords,
tokens, private keys, or session secrets.

For routine updates to the already-deployed Lifts app, use
`LIFTS_UPDATE_GUIDE.md`.

Last updated: 2026-05-03 16:13 UTC

## Current VPS shape

- Host: `tdoggie.com`
- Primary IPv4: `173.230.136.222`
- User for app checkouts: `tindell`
- OS: Rocky Linux 9.4
- Runtime: Node.js 20, npm 10, git
- Public entry point: nginx on ports `80` and `443`
- Certificates: Certbot modifies nginx site files and renews automatically
- SELinux: enforcing; nginx proxying requires `httpd_can_network_connect=on`
- Root handoff: Codex usually prepares scripts; user runs root changes with
  `sudo`

## Current public services

| Domain | Type | Backend | Data | Notes |
| --- | --- | --- | --- | --- |
| `tdoggie.com` | static site | `/var/www/tdoggie.com` | files in web root | redirects `/blog/...` to blog host |
| `blog.tdoggie.com` | static site | `/var/www/tdoggie.com/blog` | files in web root | HTTPS via Certbot |
| `lifts.tdoggie.com` | Node app | `127.0.0.1:3002` | `/var/lib/lifts/lifts.sqlite` | `lifts.service` |

Retired paths still exist and should not be deleted without a separate backup
decision:

- `/home/tindell/app`
- `/home/tindell/canvasser`
- `/home/tindell/learning-app`
- `/var/www/lecordonbot.tdoggie.com`
- `/home/tindell/factorio_server`
- `/opt/factorio`

## nginx layout

Active nginx includes:

- `/etc/nginx/conf.d/*.conf`
- `/etc/nginx/sites-enabled/*`

Site convention:

- Write config to `/etc/nginx/sites-available/<domain>`
- Enable by symlink at `/etc/nginx/sites-enabled/<domain>`
- Always run `nginx -t`
- Then run `systemctl reload nginx`

Do not rely on `/etc/nginx/default.d/*.conf`; it is not included by the active
server blocks.

## App allocation rules

For each new app, choose these values before touching the server:

| Item | Convention |
| --- | --- |
| Domain | `<app>.tdoggie.com` |
| DNS | `A <app> -> 173.230.136.222`; optional `AAAA` only if IPv6 is verified |
| Checkout | `/home/tindell/<app>` |
| Data | `/var/lib/<app>` |
| Env | `/etc/<app>/<app>.env` |
| Service | `<app>.service` |
| Bind | `127.0.0.1` only |
| Port | next free private port, starting after `3002` |
| nginx config | `/etc/nginx/sites-available/<app>.tdoggie.com` |

Known historical ports:

- `3000`: old `/home/tindell/app`
- `3001`: old `/home/tindell/canvasser`
- `3002`: Lifts

Use `3003` for the next Node app unless it is already occupied.

## DNS checklist

In Akamai/Linode DNS, add at least:

```text
Type: A
Host: <app>
Value: 173.230.136.222
TTL: 30 seconds or default
```

Only add an `AAAA` record when the VPS has a working global IPv6 address and
external IPv6 checks pass. Browsers may prefer IPv6, so a bad `AAAA` record can
make a healthy IPv4 app look down.

Verify:

```sh
dig +short <app>.tdoggie.com A
dig +short <app>.tdoggie.com AAAA
```

## Standard deployment workflow

1. Prepare a public-safe repo:
   - include app source, tests, package manifests, public docs
   - exclude `.env`, local DB files, server notes, `node_modules`

2. Pick app identity:

```sh
APP=<app>
DOMAIN="${APP}.tdoggie.com"
PORT=<next-free-port>
APP_DIR="/home/tindell/${APP}"
DATA_DIR="/var/lib/${APP}"
ENV_DIR="/etc/${APP}"
ENV_FILE="${ENV_DIR}/${APP}.env"
SERVICE="${APP}.service"
```

3. Preflight as `tindell`:

```sh
ssh tindell@tdoggie.com
node --version
npm --version
git --version
systemctl is-active nginx
ss -ltnp "sport = :${PORT}"
getent ahostsv4 "${DOMAIN}"
```

4. Clone/update app as `tindell`:

```sh
git clone https://github.com/<owner>/<repo>.git "${APP_DIR}"
cd "${APP_DIR}"
npm ci
npm test
npm prune --omit=dev
```

5. Prepare root handoff folder:

```sh
mkdir -p "/home/tindell/codex-${APP}-deploy"
```

Put these files there:

- `README.md`: exact deployment steps and rollback notes
- `verify-${APP}.sh`: read-only checks
- `apply-${APP}-root.sh`: sudo-required changes

6. Run root setup with sudo.

The root script should:

- back up existing nginx/service/env files to `/root/codex-<app>-deploy-<ts>`
- create `/etc/<app>` and `/var/lib/<app>`
- write an env file with mode `640`, owned `root:tindell`
- write `/etc/systemd/system/<app>.service`
- write nginx site config and enable the symlink
- enable SELinux nginx proxying if needed:

```sh
setsebool -P httpd_can_network_connect on
```

- run `systemctl daemon-reload`
- run `nginx -t`
- run `systemctl reload nginx`
- enable/restart the app service
- wait/retry until `http://127.0.0.1:<port>/login` or health check responds
- run Certbot only after DNS resolves

7. Verify as `tindell`:

```sh
systemctl is-active <app>.service
systemctl is-enabled <app>.service
curl -fsSI "http://127.0.0.1:<port>/login"
curl -fsSI -H "Host: <app>.tdoggie.com" "http://127.0.0.1/login"
curl -fsSI "https://<app>.tdoggie.com/login"
journalctl -u <app>.service -n 80 --no-pager
```

## Standard Node systemd unit

```ini
[Unit]
Description=<App> service
After=network.target

[Service]
Type=simple
User=tindell
WorkingDirectory=/home/tindell/<app>
EnvironmentFile=/etc/<app>/<app>.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

## Standard nginx proxy site

Start with HTTP only and let Certbot edit in HTTPS:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name <app>.tdoggie.com;

    location / {
        proxy_pass http://127.0.0.1:<port>;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

After DNS resolves:

```sh
certbot --nginx -d <app>.tdoggie.com --redirect
```

If `certbot` is not on PATH, check `/snap/bin/certbot`.

## Standard env file

Use app-specific keys, but keep this shape:

```sh
HOST=127.0.0.1
PORT=<port>
NODE_ENV=production
<APP>_DB_PATH=/var/lib/<app>/<app>.sqlite
<APP>_PASSWORD=...
<APP>_SESSION_SECRET=...
```

Do not store env files in git.

## Updating an existing app

As `tindell`:

```sh
cd /home/tindell/<app>
git fetch --prune origin
git switch main
git pull --ff-only origin main
npm ci
npm test
npm prune --omit=dev
sudo systemctl restart <app>.service
systemctl status <app>.service --no-pager
curl -fsSI "https://<app>.tdoggie.com/login"
```

If database migrations exist, make a backup before restart:

```sh
cp -a /var/lib/<app> "/home/tindell/<app>-data-backup-$(date +%Y%m%d-%H%M%S)"
```

## Rollback checklist

If a deployment fails:

```sh
systemctl status <app>.service --no-pager
journalctl -u <app>.service -n 120 --no-pager
nginx -t
tail -n 80 /var/log/nginx/error.log
```

Use the root backup created by the apply script:

```sh
ls -ld /root/codex-<app>-deploy-*
```

Prefer reverting by:

- restoring the previous nginx site config
- reloading nginx after `nginx -t`
- checking out a previous app commit
- restarting the app service

Avoid deleting data. Move or back up first.

## Common failure modes

- Public site hangs: DNS may be pointing to a bad `AAAA` record.
- nginx returns `502`: app is down, wrong port, or SELinux blocks proxying.
- `curl 127.0.0.1:<port>` fails right after restart: add wait/retry logic.
- Certbot fails: DNS may not resolve yet, or nginx vhost check is failing.
- Git checkout gets dirty after `npm ci`: publish the npm-formatted lockfile.
- `sudo` needed: use a handoff script and stop for user action.

## Lifts reference deployment

Lifts is the current model deployment:

- Repo: `https://github.com/baron-de-botetourt/lifts`
- Checkout: `/home/tindell/lifts`
- Port: `3002`
- Service: `lifts.service`
- Env: `/etc/lifts/lifts.env`
- Data: `/var/lib/lifts/lifts.sqlite`
- nginx: `/etc/nginx/sites-available/lifts.tdoggie.com`
- Verify: `/home/tindell/lifts/deploy/tdoggie/verify-lifts.sh`

Use its `deploy/tdoggie` scripts as templates for the next app.

# Lifts update guide

This guide covers routine updates to the deployed Lifts app at
`https://lifts.tdoggie.com`.

Use `TDOGGIE_DEPLOYMENT_GUIDE.md` for first-time deployments and VPS structure.
Use this file when Lifts is already deployed and you need to ship code changes.

## Current production shape

- Public URL: `https://lifts.tdoggie.com`
- GitHub repo: `https://github.com/baron-de-botetourt/lifts`
- VPS checkout: `/home/tindell/lifts`
- Service: `lifts.service`
- Local app bind: `127.0.0.1:3002`
- Env file: `/etc/lifts/lifts.env`
- Production DB: `/var/lib/lifts/lifts.sqlite`
- nginx site: `/etc/nginx/sites-available/lifts.tdoggie.com`

Do not copy local `data/lifts.sqlite` to production during routine updates.

## Normal code update flow

On your local machine:

```sh
cd /Users/tindelllockett/projects/lifts
npm test
git status --short
git add <changed-files>
git commit -m "<clear message>"
git push github-botetourt:baron-de-botetourt/lifts.git published-main:main
```

The `github-botetourt` SSH host alias must use the Botetourt GitHub key:
`/Users/tindelllockett/.ssh/id_ed25519_botetourt`.

On the VPS:

```sh
ssh tdoggie-lifts
cd /home/tindell/lifts
git fetch --prune origin
git switch main
git pull --ff-only origin main
npm ci
npm test
npm prune --omit=dev
sudo systemctl restart lifts.service
systemctl status lifts.service --no-pager
```

The `tdoggie-lifts` SSH host alias should use the persistent Lifts deploy key:
`/Users/tindelllockett/.ssh/id_ed25519_lifts_deploy`.

If the SSH config is unavailable, connect with:

```sh
ssh -i /Users/tindelllockett/.ssh/id_ed25519_lifts_deploy -o IdentitiesOnly=yes tindell@tdoggie.com
```

Then verify:

```sh
curl -fsSI http://127.0.0.1:3002/login
curl -fsSI -H "Host: lifts.tdoggie.com" http://127.0.0.1/login
curl -fsSI https://lifts.tdoggie.com/login
/home/tindell/lifts/deploy/tdoggie/verify-lifts.sh
```

## When a change touches the database

If code changes modify migrations, schema, seed data, or database behavior,
make a production DB backup before restarting:

```sh
ts=$(date +%Y%m%d-%H%M%S)
mkdir -p "/home/tindell/lifts-db-backups"
cp -a /var/lib/lifts "/home/tindell/lifts-db-backups/lifts-${ts}"
```

Then deploy normally.

After restart, verify the DB is still valid:

```sh
sqlite3 /var/lib/lifts/lifts.sqlite "PRAGMA integrity_check;"
curl -fsS -o /tmp/lifts-export.sqlite https://lifts.tdoggie.com/export/database.sqlite
```

The export URL requires an authenticated browser session. For command-line
export tests, use browser-based verification unless you have a safe temporary
auth cookie.

## When package dependencies change

If `package.json` or `package-lock.json` changed, use the normal VPS update
flow. `npm ci` installs exactly what the lockfile says.

If `npm ci` leaves `package-lock.json` modified on the VPS, do not ignore it.
That usually means the lockfile formatting or npm version differs. Bring the
stable lockfile back into the repo and publish it so future deploys stay clean.

## When nginx, systemd, or env changes

Most Lifts code updates should not touch nginx/systemd. If they do, use the root
handoff script pattern from `TDOGGIE_DEPLOYMENT_GUIDE.md`.

For existing Lifts root config, the applied script is:

```sh
cd /home/tindell/lifts
sudo ./deploy/tdoggie/apply-lifts-root.sh
```

This script keeps an existing `/etc/lifts/lifts.env`, writes/updates the
systemd unit and nginx site, runs `nginx -t`, reloads nginx, restarts
`lifts.service`, and verifies local app/nginx health.

Do not put real passwords or session secrets into git. Update
`/etc/lifts/lifts.env` directly on the VPS if secrets need to rotate.

## Quick status checks

```sh
systemctl is-active lifts.service
systemctl is-enabled lifts.service
journalctl -u lifts.service -n 80 --no-pager
ss -ltnp "sport = :3002"
curl -fsSI https://lifts.tdoggie.com/login
```

nginx checks:

```sh
nginx -t
systemctl is-active nginx
tail -n 80 /var/log/nginx/error.log
```

SELinux check:

```sh
getenforce
getsebool httpd_can_network_connect
```

Expected:

```text
Enforcing
httpd_can_network_connect --> on
```

## Rollback

If a code update breaks production:

```sh
cd /home/tindell/lifts
git log --oneline -n 5
git checkout <previous-good-commit>
npm ci
npm test
npm prune --omit=dev
sudo systemctl restart lifts.service
systemctl status lifts.service --no-pager
curl -fsSI https://lifts.tdoggie.com/login
```

Once the public repo is fixed, return the VPS checkout to `main`:

```sh
git switch main
git pull --ff-only origin main
sudo systemctl restart lifts.service
```

If a database migration caused the failure, stop before restoring data and
inspect the backup. Restoring `/var/lib/lifts` should be a deliberate step, not
an automatic rollback.

## Common update failures

- `git pull --ff-only` fails: the VPS checkout is dirty. Run `git status` and
  inspect every modified file before changing it.
- `npm ci` fails on `better-sqlite3`: confirm Node 20 is active and native build
  tools are installed.
- `lifts.service` fails: inspect `journalctl -u lifts.service -n 120 --no-pager`.
- nginx returns `502`: confirm the app is listening on `127.0.0.1:3002` and
  `httpd_can_network_connect` is on.
- Browser hangs while forced IPv4 works: DNS may be preferring a bad `AAAA`
  record.

## Codex reminder

When Codex is asked to update Lifts:

1. Read this guide and `TDOGGIE_DEPLOYMENT_GUIDE.md`.
2. Run local tests before publishing.
3. Preserve production DB data.
4. Use non-root deploy steps directly.
5. Stop and ask the user for sudo when root changes are required.

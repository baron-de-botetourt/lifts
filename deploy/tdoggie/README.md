# Lifts deployment on tdoggie.com

These scripts deploy Lifts to the VPS described in `TDOGGIE_SERVER_SETUP.md`
without publishing local data or secrets.

## 1. DNS

Create this DNS record before requesting the HTTPS certificate:

```text
lifts.tdoggie.com A 173.230.136.222
```

## 2. SSH access

Codex access uses the temporary key documented in `TDOGGIE_SERVER_SETUP.md`:

```sh
ssh -i /private/tmp/codex_lifts_deploy_ed25519 -o IdentitiesOnly=yes tindell@tdoggie.com
```

## 3. Root prerequisites

The VPS currently uses Rocky Linux module streams for Node.js. Run this first
with sudo so the app deploy sees Node 20+ and native build tools for
`better-sqlite3` are available if a prebuild is not usable:

```sh
mkdir -p /home/tindell/codex-lifts-deploy
cd /home/tindell/codex-lifts-deploy
curl -fsSLO https://raw.githubusercontent.com/baron-de-botetourt/lifts/main/deploy/tdoggie/prepare-lifts-root.sh
chmod +x prepare-lifts-root.sh
sudo ./prepare-lifts-root.sh
```

## 4. App checkout

Run as `tindell` on the VPS:

```sh
mkdir -p /home/tindell/deploy
cd /home/tindell/deploy
curl -fsSLO https://raw.githubusercontent.com/baron-de-botetourt/lifts/main/deploy/tdoggie/deploy-app.sh
chmod +x deploy-app.sh
./deploy-app.sh
```

The app deploy runs `npm ci`, `npm test`, and then prunes dev dependencies for
production.

## 5. Root setup

Run after the app checkout exists:

```sh
cd /home/tindell/lifts
sudo ./deploy/tdoggie/apply-lifts-root.sh
```

The root script creates `/etc/lifts/lifts.env` if it does not exist. It prompts
for the Lifts login password, generates `LIFTS_SESSION_SECRET`, writes the
systemd unit, writes the nginx site at
`/etc/nginx/sites-available/lifts.tdoggie.com`, enables the site symlink, runs
`nginx -t`, reloads nginx, and starts `lifts.service`.

For non-interactive sudo handoff, set these environment variables before
running the root script:

```sh
sudo LIFTS_PASSWORD='...' CERTBOT_EMAIL='you@example.com' ./deploy/tdoggie/apply-lifts-root.sh
```

Certbot runs only after `lifts.tdoggie.com` resolves to `173.230.136.222`.

## 6. Verify

Run as `tindell`:

```sh
/home/tindell/lifts/deploy/tdoggie/verify-lifts.sh
```

Then open:

```text
https://lifts.tdoggie.com/login
```

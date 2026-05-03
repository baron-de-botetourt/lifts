# Lifts deployment on tdoggie.com

These scripts deploy Lifts to the VPS described in `TDOGGIE_SERVER_SETUP.md`
without publishing local data or secrets.

## 1. DNS

Create this DNS record before requesting the HTTPS certificate:

```text
lifts.tdoggie.com A 173.230.136.222
```

## 2. App checkout

Run as `tindell` on the VPS:

```sh
mkdir -p /home/tindell/deploy
cd /home/tindell/deploy
curl -fsSLO https://raw.githubusercontent.com/baron-de-botetourt/lifts/main/deploy/tdoggie/deploy-app.sh
chmod +x deploy-app.sh
./deploy-app.sh
```

## 3. Root setup

Run after the app checkout exists:

```sh
cd /home/tindell/lifts
sudo ./deploy/tdoggie/apply-lifts-root.sh
```

The root script creates `/etc/lifts/lifts.env` if it does not exist. It prompts
for the Lifts login password and generates `LIFTS_SESSION_SECRET`.

## 4. Verify

Run as `tindell`:

```sh
/home/tindell/lifts/deploy/tdoggie/verify-lifts.sh
```

Then open:

```text
https://lifts.tdoggie.com/login
```

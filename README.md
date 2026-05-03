# Lifts

A tiny single-user iPhone-first lift tracker for an A/B StrongLifts-style program.

## Run

```sh
npm install
LIFTS_PASSWORD='change-me' LIFTS_SESSION_SECRET='use-a-long-random-string' npm start
```

The app listens on `PORT`, or `3000` by default. Set `HOST` to bind to a
specific interface, such as `127.0.0.1` behind nginx. The SQLite file lives at
`data/lifts.sqlite` unless `LIFTS_DB_PATH` is set.

## Configure Lifts

Edit `src/program.js` to change:

- A/B day lift lists
- starting weights
- sets and reps
- weight increments
- bodyweight rep increments
- bodyweight rep increments
- deload behavior

The app has no configuration UI by design.

## iPhone Install

Serve the app over HTTPS, open it in Safari, then use Share -> Add to Home
Screen. The app manifest and icons are included in `public/`.

## Export

After logging in, download the raw SQLite database at:

```text
/export/database.sqlite
```

## Test

```sh
npm test
```

import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { openDatabase } from "./src/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const SESSION_COOKIE = "lifts_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

export function createApp(options = {}) {
  const store = options.store || openDatabase();
  const password = options.password ?? process.env.LIFTS_PASSWORD;
  const sessionSecret = options.sessionSecret ?? process.env.LIFTS_SESSION_SECRET;
  const secureCookies = options.secureCookies ?? process.env.NODE_ENV === "production";

  if (!password) {
    throw new Error("LIFTS_PASSWORD is required");
  }
  if (!sessionSecret) {
    throw new Error("LIFTS_SESSION_SECRET is required");
  }

  const app = express();
  app.disable("x-powered-by");
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(express.static(PUBLIC_DIR, { index: false, maxAge: "1h" }));

  app.get("/login", (req, res) => {
    if (isAuthenticated(req, sessionSecret)) {
      res.redirect("/");
      return;
    }
    res.type("html").send(loginPage());
  });

  app.post("/login", (req, res) => {
    if (!sameSecret(req.body.password || "", password)) {
      res.status(401).type("html").send(loginPage("Wrong password"));
      return;
    }
    const token = createSessionToken(sessionSecret);
    res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      maxAge: SESSION_MAX_AGE_SECONDS,
      sameSite: "Lax",
      secure: secureCookies,
      path: "/"
    }));
    res.redirect("/");
  });

  app.post("/logout", (req, res) => {
    res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE, "", {
      httpOnly: true,
      maxAge: 0,
      sameSite: "Lax",
      secure: secureCookies,
      path: "/"
    }));
    res.redirect("/login");
  });

  app.use((req, res, next) => {
    if (isAuthenticated(req, sessionSecret)) {
      next();
      return;
    }
    if (req.path.startsWith("/api/") || req.path.startsWith("/export/")) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    res.redirect("/login");
  });

  app.get("/", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  });

  app.get("/api/workout/current", (req, res) => {
    res.json(store.getOrCreateCurrentWorkout());
  });

  app.post("/api/sets/:setId", (req, res, next) => {
    try {
      res.json(store.recordSet(Number(req.params.setId), Number(req.body.reps)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/workout/:id/finish", (req, res, next) => {
    try {
      res.json(store.finishWorkout(Number(req.params.id)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/workout/:id/reset", (req, res, next) => {
    try {
      res.json(store.resetWorkout(Number(req.params.id)));
    } catch (error) {
      next(error);
    }
  });

  app.get("/export/database.sqlite", (req, res, next) => {
    try {
      store.checkpoint();
      res.download(store.filename, "lifts.sqlite");
    } catch (error) {
      next(error);
    }
  });

  app.use((error, req, res, next) => {
    const status = error.status || 500;
    if (status >= 500) {
      console.error(error);
    }
    res.status(status).json({ error: error.message || "Server error" });
  });

  return app;
}

function loginPage(error = "") {
  const errorMarkup = error ? `<p class="error">${escapeHtml(error)}</p>` : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Lifts Login</title>
  <style>
    body { margin: 0; min-height: 100svh; display: grid; place-items: center; background: #f3f4f6; color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    form { width: min(88vw, 320px); display: grid; gap: 12px; }
    h1 { margin: 0 0 4px; font-size: 24px; }
    input, button { box-sizing: border-box; width: 100%; border-radius: 8px; font: inherit; }
    input { border: 1px solid #9ca3af; padding: 13px 12px; background: white; }
    button { border: 0; padding: 13px 12px; background: #244c3a; color: white; font-weight: 700; }
    .error { margin: 0; color: #a31621; font-weight: 700; }
  </style>
</head>
<body>
  <form method="post" action="/login">
    <h1>Lifts</h1>
    ${errorMarkup}
    <input name="password" type="password" autocomplete="current-password" placeholder="Password" autofocus>
    <button type="submit">Open</button>
  </form>
</body>
</html>`;
}

function isAuthenticated(req, sessionSecret) {
  const token = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  return verifySessionToken(token, sessionSecret);
}

function createSessionToken(secret) {
  const payload = JSON.stringify({
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000
  });
  const encodedPayload = Buffer.from(payload).toString("base64url");
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function verifySessionToken(token, secret) {
  if (!token || !token.includes(".")) {
    return false;
  }
  const [encodedPayload, signature] = token.split(".");
  if (!sameSecret(signature, sign(encodedPayload, secret))) {
    return false;
  }
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    return Number.isFinite(payload.exp) && payload.exp > Date.now();
  } catch {
    return false;
  }
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function sameSecret(left, right) {
  const leftHash = crypto.createHash("sha256").update(String(left)).digest();
  const rightHash = crypto.createHash("sha256").update(String(right)).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function parseCookies(header) {
  return Object.fromEntries(header.split(";").filter(Boolean).map((cookie) => {
    const index = cookie.indexOf("=");
    const key = index >= 0 ? cookie.slice(0, index).trim() : cookie.trim();
    const value = index >= 0 ? cookie.slice(index + 1).trim() : "";
    return [key, decodeURIComponent(value)];
  }));
}

function serializeCookie(name, value, options) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }
  if (options.path) {
    parts.push(`Path=${options.path}`);
  }
  if (options.httpOnly) {
    parts.push("HttpOnly");
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }
  if (options.secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST;
  const app = createApp();
  app.listen(port, host, () => {
    console.log(`Lifts listening on http://${host || "localhost"}:${port}`);
  });
}

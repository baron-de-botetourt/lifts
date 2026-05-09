import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createApp } from "../server.js";
import { openDatabase } from "../src/db.js";

test("unauthenticated API and export requests are rejected", async () => {
  const fixture = await startFixture();
  try {
    const api = await fetch(`${fixture.baseUrl}/api/workout/current`);
    const exportResponse = await fetch(`${fixture.baseUrl}/export/database.sqlite`);

    assert.equal(api.status, 401);
    assert.equal(exportResponse.status, 401);
  } finally {
    await fixture.close();
  }
});

test("login sets a long-lived HttpOnly cookie", async () => {
  const fixture = await startFixture();
  try {
    const response = await login(fixture.baseUrl);
    const cookie = response.headers.get("set-cookie") || "";

    assert.equal(response.status, 302);
    assert.match(cookie, /lifts_session=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Max-Age=15552000/);
  } finally {
    await fixture.close();
  }
});

test("current workout resumes the same draft across requests", async () => {
  const fixture = await startFixture();
  try {
    const cookie = await authCookie(fixture.baseUrl);
    const first = await requestJson(fixture.baseUrl, "/api/workout/current", cookie);
    const second = await requestJson(fixture.baseUrl, "/api/workout/current", cookie);

    assert.equal(first.workout.id, second.workout.id);
    assert.equal(first.workout.programDay, "A");
  } finally {
    await fixture.close();
  }
});

test("current workout API exposes plate guides for barbell lifts only", async () => {
  const fixture = await startFixture();
  try {
    const cookie = await authCookie(fixture.baseUrl);
    const current = await requestJson(fixture.baseUrl, "/api/workout/current", cookie);
    const squat = current.lifts.find((lift) => lift.liftId === "squat");
    const chinUp = current.lifts.find((lift) => lift.liftId === "chin_up");
    const latRaise = current.lifts.find((lift) => lift.liftId === "lat_raise");

    assert.deepEqual(squat.plateGuide, {
      available: true,
      targetWeight: 45,
      barWeight: 45,
      sideWeight: 0,
      platesPerSide: []
    });
    assert.equal(Object.hasOwn(chinUp, "plateGuide"), false);
    assert.equal(Object.hasOwn(latRaise, "plateGuide"), false);
  } finally {
    await fixture.close();
  }
});

test("finishing twice through the API does not double-apply progression", async () => {
  const fixture = await startFixture();
  try {
    const cookie = await authCookie(fixture.baseUrl);
    let current = await requestJson(fixture.baseUrl, "/api/workout/current", cookie);
    const squat = current.lifts.find((lift) => lift.liftId === "squat");
    for (const set of squat.sets) {
      current = await requestJson(fixture.baseUrl, `/api/sets/${set.id}`, cookie, {
        method: "POST",
        body: JSON.stringify({ reps: squat.targetReps })
      });
    }

    await requestJson(fixture.baseUrl, `/api/workout/${current.workout.id}/finish`, cookie, { method: "POST" });
    await requestJson(fixture.baseUrl, `/api/workout/${current.workout.id}/finish`, cookie, { method: "POST" });

    assert.equal(fixture.store.getLiftState("squat").next_weight, 50);
  } finally {
    await fixture.close();
  }
});

test("resetting through the API clears recorded sets on the current workout", async () => {
  const fixture = await startFixture();
  try {
    const cookie = await authCookie(fixture.baseUrl);
    let current = await requestJson(fixture.baseUrl, "/api/workout/current", cookie);
    const squat = current.lifts.find((lift) => lift.liftId === "squat");
    current = await requestJson(fixture.baseUrl, `/api/sets/${squat.sets[0].id}`, cookie, {
      method: "POST",
      body: JSON.stringify({ reps: squat.targetReps })
    });

    const reset = await requestJson(fixture.baseUrl, `/api/workout/${current.workout.id}/reset`, cookie, {
      method: "POST"
    });
    const resetSquat = reset.lifts.find((lift) => lift.liftId === "squat");

    assert.equal(reset.workout.id, current.workout.id);
    assert.equal(reset.workout.status, "in_progress");
    assert.ok(resetSquat.sets.every((set) => set.reps === null && set.completedAt === null));
    assert.equal(reset.lastSetCompletedAt, null);
    assert.equal(fixture.store.getLiftState("squat").next_weight, 45);
  } finally {
    await fixture.close();
  }
});

test("authenticated SQLite export downloads the database file", async () => {
  const fixture = await startFixture();
  try {
    const cookie = await authCookie(fixture.baseUrl);
    await requestJson(fixture.baseUrl, "/api/workout/current", cookie);

    const response = await fetch(`${fixture.baseUrl}/export/database.sqlite`, {
      headers: { Cookie: cookie }
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const magic = Buffer.from(bytes.slice(0, 16)).toString("utf8");

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-disposition") || "", /lifts\.sqlite/);
    assert.equal(magic, "SQLite format 3\0");
  } finally {
    await fixture.close();
  }
});

async function startFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lifts-api-"));
  const store = openDatabase({ filename: path.join(dir, "test.sqlite") });
  const app = createApp({
    store,
    password: "secret",
    sessionSecret: "test-session-secret",
    secureCookies: false
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    store,
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      store.close();
    }
  };
}

async function login(baseUrl) {
  return fetch(`${baseUrl}/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "password=secret"
  });
}

async function authCookie(baseUrl) {
  const response = await login(baseUrl);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);
  return cookie.split(";")[0];
}

async function requestJson(baseUrl, pathName, cookie, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });
  assert.ok(response.ok, `${pathName} returned ${response.status}`);
  return response.json();
}

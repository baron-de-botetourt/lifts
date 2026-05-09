import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { openDatabase } from "../src/db.js";

test("successful weighted lift increments by the configured amount", () => {
  const store = freshStore();
  const workout = store.getOrCreateCurrentWorkout();
  completeLift(store, workout, "squat");

  store.finishWorkout(workout.workout.id);

  assert.equal(store.getLiftState("squat").next_weight, 50);
  assert.equal(store.getLiftState("squat").consecutive_failures, 0);
  store.close();
});

test("overhead press increments by two and a half pounds", () => {
  const store = freshStore();
  store.finishWorkout(store.getOrCreateCurrentWorkout().workout.id);
  const workout = store.getOrCreateCurrentWorkout();
  completeLift(store, workout, "overhead_press");

  store.finishWorkout(workout.workout.id);

  assert.equal(store.getLiftState("overhead_press").next_weight, 47.5);
  store.close();
});

test("missed weighted lift repeats and increments failure count", () => {
  const store = freshStore();
  const workout = store.getOrCreateCurrentWorkout();

  store.finishWorkout(workout.workout.id);

  assert.equal(store.getLiftState("bench_press").next_weight, 45);
  assert.equal(store.getLiftState("bench_press").consecutive_failures, 1);
  store.close();
});

test("third weighted failure deloads 10 percent rounded down to nearest 5 lb", () => {
  const store = freshStore();

  store.finishWorkout(store.getOrCreateCurrentWorkout().workout.id);
  store.finishWorkout(store.getOrCreateCurrentWorkout().workout.id);
  store.finishWorkout(store.getOrCreateCurrentWorkout().workout.id);
  store.finishWorkout(store.getOrCreateCurrentWorkout().workout.id);
  store.finishWorkout(store.getOrCreateCurrentWorkout().workout.id);

  assert.equal(store.getLiftState("bench_press").next_weight, 40);
  assert.equal(store.getLiftState("bench_press").consecutive_failures, 0);
  store.close();
});

test("successful bodyweight lift adds one target rep per set", () => {
  const store = freshStore();
  const workout = store.getOrCreateCurrentWorkout();
  completeLift(store, workout, "chin_up");

  store.finishWorkout(workout.workout.id);

  assert.equal(store.getLiftState("chin_up").next_target_reps, 11);
  store.close();
});

test("missed bodyweight lift repeats without deload", () => {
  const store = freshStore();
  const workout = store.getOrCreateCurrentWorkout();

  store.finishWorkout(workout.workout.id);

  assert.equal(store.getLiftState("chin_up").next_target_reps, 10);
  assert.equal(store.getLiftState("chin_up").consecutive_failures, 0);
  store.close();
});

test("current workout resumes drafts and alternates day after finishing", () => {
  const store = freshStore();
  const first = store.getOrCreateCurrentWorkout();
  const resumed = store.getOrCreateCurrentWorkout();

  assert.equal(first.workout.id, resumed.workout.id);
  assert.equal(first.workout.programDay, "A");

  store.finishWorkout(first.workout.id);
  const next = store.getOrCreateCurrentWorkout();

  assert.equal(next.workout.programDay, "B");
  store.close();
});

test("finishing the same workout twice does not apply progression twice", () => {
  const store = freshStore();
  const workout = store.getOrCreateCurrentWorkout();
  completeLift(store, workout, "squat");

  store.finishWorkout(workout.workout.id);
  store.finishWorkout(workout.workout.id);

  assert.equal(store.getLiftState("squat").next_weight, 50);
  store.close();
});

test("resetting an in-progress workout clears recorded sets without progression", () => {
  const store = freshStore();
  const workout = store.getOrCreateCurrentWorkout();
  completeLift(store, workout, "squat");

  const reset = store.resetWorkout(workout.workout.id);
  const squat = reset.lifts.find((lift) => lift.liftId === "squat");

  assert.equal(reset.workout.id, workout.workout.id);
  assert.equal(reset.workout.status, "in_progress");
  assert.ok(squat.sets.every((set) => set.reps === null && set.completedAt === null));
  assert.equal(store.getLiftState("squat").next_weight, 45);
  store.close();
});

test("current workout includes plate guide data for barbell lifts only", () => {
  const store = freshStore();
  const workout = store.getOrCreateCurrentWorkout();
  const squat = workout.lifts.find((candidate) => candidate.liftId === "squat");
  const chinUp = workout.lifts.find((candidate) => candidate.liftId === "chin_up");
  const latRaise = workout.lifts.find((candidate) => candidate.liftId === "lat_raise");

  assert.deepEqual(squat.plateGuide, {
    available: true,
    targetWeight: 45,
    barWeight: 45,
    sideWeight: 0,
    platesPerSide: []
  });
  assert.equal(Object.hasOwn(chinUp, "plateGuide"), false);
  assert.equal(Object.hasOwn(latRaise, "plateGuide"), false);
  store.close();
});

function completeLift(store, workout, liftId) {
  const lift = workout.lifts.find((candidate) => candidate.liftId === liftId);
  assert.ok(lift, `Expected lift ${liftId}`);
  for (const set of lift.sets) {
    store.recordSet(set.id, lift.targetReps);
  }
}

function freshStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lifts-test-"));
  return openDatabase({ filename: path.join(dir, "test.sqlite") });
}

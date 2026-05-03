import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import {
  PROGRAM,
  deloadWeight,
  getAllLiftIds,
  getDayLifts,
  getLift,
  nextProgramDay
} from "./program.js";

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "lifts.sqlite");

export function openDatabase(options = {}) {
  const filename = options.filename || process.env.LIFTS_DB_PATH || DEFAULT_DB_PATH;
  fs.mkdirSync(path.dirname(filename), { recursive: true });

  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  migrate(db);
  seedLiftState(db);

  return createStore(db, filename);
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const current = db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_version").get().version;
  if (current >= 1) {
    return;
  }

  db.exec(`
    CREATE TABLE workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_day TEXT NOT NULL CHECK (program_day IN ('A', 'B')),
      status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE TABLE workout_lifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      lift_id TEXT NOT NULL,
      target_sets INTEGER NOT NULL,
      target_reps INTEGER NOT NULL,
      target_weight REAL,
      success INTEGER CHECK (success IN (0, 1)),
      UNIQUE (workout_id, lift_id)
    );

    CREATE TABLE sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_lift_id INTEGER NOT NULL REFERENCES workout_lifts(id) ON DELETE CASCADE,
      set_number INTEGER NOT NULL,
      reps INTEGER,
      weight REAL,
      completed_at TEXT,
      UNIQUE (workout_lift_id, set_number)
    );

    CREATE TABLE lift_state (
      lift_id TEXT PRIMARY KEY,
      next_weight REAL,
      next_target_reps INTEGER NOT NULL,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX idx_workouts_status ON workouts(status);
    CREATE INDEX idx_workout_lifts_workout ON workout_lifts(workout_id, position);
    CREATE INDEX idx_sets_workout_lift ON sets(workout_lift_id, set_number);
  `);

  db.prepare("INSERT INTO schema_version (version, applied_at) VALUES (1, ?)").run(nowIso());
}

function seedLiftState(db) {
  const insert = db.prepare(`
    INSERT INTO lift_state (lift_id, next_weight, next_target_reps, consecutive_failures, updated_at)
    VALUES (?, ?, ?, 0, ?)
  `);
  const exists = db.prepare("SELECT 1 FROM lift_state WHERE lift_id = ?");
  const seed = db.transaction(() => {
    for (const liftId of getAllLiftIds()) {
      if (exists.get(liftId)) {
        continue;
      }
      const lift = getLift(liftId);
      insert.run(liftId, lift.weighted ? lift.startingWeightLb : null, lift.targetReps, nowIso());
    }
  });
  seed();
}

function createStore(db, filename) {
  const createWorkout = db.transaction(() => {
    const day = determineNextDay(db);
    const workout = db.prepare(`
      INSERT INTO workouts (program_day, status, started_at)
      VALUES (?, 'in_progress', ?)
    `).run(day, nowIso());
    const workoutId = Number(workout.lastInsertRowid);

    const insertLift = db.prepare(`
      INSERT INTO workout_lifts (
        workout_id, position, lift_id, target_sets, target_reps, target_weight
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertSet = db.prepare(`
      INSERT INTO sets (workout_lift_id, set_number, weight)
      VALUES (?, ?, ?)
    `);
    const stateQuery = db.prepare("SELECT * FROM lift_state WHERE lift_id = ?");

    getDayLifts(day).forEach((liftId, index) => {
      const lift = getLift(liftId);
      const state = stateQuery.get(liftId);
      const targetReps = lift.weighted ? lift.targetReps : state.next_target_reps;
      const targetWeight = lift.weighted ? state.next_weight : null;
      const liftRow = insertLift.run(
        workoutId,
        index + 1,
        liftId,
        lift.targetSets,
        targetReps,
        targetWeight
      );
      const workoutLiftId = Number(liftRow.lastInsertRowid);
      for (let setNumber = 1; setNumber <= lift.targetSets; setNumber += 1) {
        insertSet.run(workoutLiftId, setNumber, targetWeight);
      }
    });

    return workoutId;
  });

  const finish = db.transaction((workoutId) => {
    const workout = db.prepare("SELECT * FROM workouts WHERE id = ?").get(workoutId);
    if (!workout) {
      throw httpError(404, "Workout not found");
    }
    if (workout.status === "completed") {
      return workoutId;
    }

    const liftRows = db.prepare(`
      SELECT * FROM workout_lifts
      WHERE workout_id = ?
      ORDER BY position
    `).all(workoutId);
    const setsQuery = db.prepare("SELECT * FROM sets WHERE workout_lift_id = ? ORDER BY set_number");
    const stateQuery = db.prepare("SELECT * FROM lift_state WHERE lift_id = ?");
    const updateLiftSuccess = db.prepare("UPDATE workout_lifts SET success = ? WHERE id = ?");
    const updateState = db.prepare(`
      UPDATE lift_state
      SET next_weight = ?, next_target_reps = ?, consecutive_failures = ?, updated_at = ?
      WHERE lift_id = ?
    `);

    for (const liftRow of liftRows) {
      const lift = getLift(liftRow.lift_id);
      const sets = setsQuery.all(liftRow.id);
      const success = sets.length === liftRow.target_sets
        && sets.every((set) => Number.isInteger(set.reps) && set.reps >= liftRow.target_reps);
      updateLiftSuccess.run(success ? 1 : 0, liftRow.id);

      const state = stateQuery.get(liftRow.lift_id);
      if (lift.weighted) {
        let nextWeight = liftRow.target_weight;
        let failures = 0;
        if (success) {
          nextWeight = liftRow.target_weight + lift.incrementLb;
        } else {
          failures = state.consecutive_failures + 1;
          if (failures >= PROGRAM.deload.failures) {
            nextWeight = deloadWeight(liftRow.target_weight);
            failures = 0;
          }
        }
        updateState.run(nextWeight, lift.targetReps, failures, nowIso(), liftRow.lift_id);
      } else {
        const nextReps = success ? liftRow.target_reps + lift.repIncrement : liftRow.target_reps;
        updateState.run(null, nextReps, 0, nowIso(), liftRow.lift_id);
      }
    }

    db.prepare("UPDATE workouts SET status = 'completed', finished_at = ? WHERE id = ?").run(nowIso(), workoutId);
    return workoutId;
  });

  return {
    filename,
    getOrCreateCurrentWorkout() {
      const current = db.prepare(`
        SELECT id FROM workouts
        WHERE status = 'in_progress'
        ORDER BY id DESC
        LIMIT 1
      `).get();
      const workoutId = current ? current.id : createWorkout();
      return hydrateWorkout(db, workoutId);
    },
    getWorkout(workoutId) {
      return hydrateWorkout(db, workoutId);
    },
    recordSet(setId, reps) {
      if (!Number.isInteger(reps) || reps < 0 || reps > 99) {
        throw httpError(400, "Reps must be an integer from 0 to 99");
      }

      const row = db.prepare(`
        SELECT
          sets.*,
          workout_lifts.workout_id,
          workout_lifts.target_weight,
          workouts.status
        FROM sets
        JOIN workout_lifts ON workout_lifts.id = sets.workout_lift_id
        JOIN workouts ON workouts.id = workout_lifts.workout_id
        WHERE sets.id = ?
      `).get(setId);
      if (!row) {
        throw httpError(404, "Set not found");
      }
      if (row.status !== "in_progress") {
        throw httpError(409, "Cannot edit a completed workout");
      }

      const completedAt = row.completed_at || nowIso();
      db.prepare(`
        UPDATE sets
        SET reps = ?, weight = ?, completed_at = ?
        WHERE id = ?
      `).run(reps, row.target_weight, completedAt, setId);
      return hydrateWorkout(db, row.workout_id);
    },
    finishWorkout(workoutId) {
      const id = finish(workoutId);
      return hydrateWorkout(db, id);
    },
    getLiftState(liftId) {
      return db.prepare("SELECT * FROM lift_state WHERE lift_id = ?").get(liftId);
    },
    checkpoint() {
      db.pragma("wal_checkpoint(TRUNCATE)");
    },
    close() {
      db.close();
    }
  };
}

function hydrateWorkout(db, workoutId) {
  const workout = db.prepare("SELECT * FROM workouts WHERE id = ?").get(workoutId);
  if (!workout) {
    throw httpError(404, "Workout not found");
  }

  const liftRows = db.prepare(`
    SELECT * FROM workout_lifts
    WHERE workout_id = ?
    ORDER BY position
  `).all(workoutId);
  const setsQuery = db.prepare("SELECT * FROM sets WHERE workout_lift_id = ? ORDER BY set_number");

  const lifts = liftRows.map((row) => {
    const lift = getLift(row.lift_id);
    const sets = setsQuery.all(row.id).map((set) => ({
      id: set.id,
      setNumber: set.set_number,
      reps: set.reps,
      weight: set.weight,
      completedAt: set.completed_at
    }));
    return {
      id: row.id,
      liftId: row.lift_id,
      name: lift.name,
      weighted: lift.weighted,
      targetSets: row.target_sets,
      targetReps: row.target_reps,
      targetWeight: row.target_weight,
      success: row.success,
      sets
    };
  });

  const lastSetCompletedAt = lifts
    .flatMap((lift) => lift.sets)
    .map((set) => set.completedAt)
    .filter(Boolean)
    .sort()
    .at(-1) || null;

  return {
    workout: {
      id: workout.id,
      programDay: workout.program_day,
      status: workout.status,
      startedAt: workout.started_at,
      finishedAt: workout.finished_at
    },
    units: PROGRAM.units,
    lastSetCompletedAt,
    lifts
  };
}

function determineNextDay(db) {
  const completed = db.prepare(`
    SELECT program_day FROM workouts
    WHERE status = 'completed'
    ORDER BY finished_at DESC, id DESC
    LIMIT 1
  `).get();
  return completed ? nextProgramDay(completed.program_day) : PROGRAM.firstDay;
}

function nowIso() {
  return new Date().toISOString();
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

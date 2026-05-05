export const PROGRAM = {
  units: "lb",
  firstDay: "A",
  deload: {
    failures: 3,
    percent: 0.1,
    roundTo: 5
  },
  days: {
    A: ["squat", "bench_press", "barbell_row", "chin_up", "lat_raise"],
    B: ["squat", "overhead_press", "deadlift", "barbell_curl", "knee_raises"]
  },
  lifts: {
    squat: {
      name: "Squat",
      weighted: true,
      targetSets: 5,
      targetReps: 5,
      startingWeightLb: 45,
      incrementLb: 5
    },
    bench_press: {
      name: "Bench Press",
      weighted: true,
      targetSets: 5,
      targetReps: 5,
      startingWeightLb: 45,
      incrementLb: 5
    },
    barbell_row: {
      name: "Barbell Row",
      weighted: true,
      targetSets: 5,
      targetReps: 5,
      startingWeightLb: 45,
      incrementLb: 5
    },
    chin_up: {
      name: "Chin Up",
      weighted: false,
      targetSets: 3,
      targetReps: 10,
      repIncrement: 1
    },
    lat_raise: {
      name: "Lat Raise",
      weighted: true,
      targetSets: 3,
      targetReps: 10,
      startingWeightLb: 10,
      incrementLb: 5
    },
    overhead_press: {
      name: "Overhead Press",
      weighted: true,
      targetSets: 5,
      targetReps: 5,
      startingWeightLb: 45,
      incrementLb: 2.5
    },
    deadlift: {
      name: "Deadlift",
      weighted: true,
      targetSets: 1,
      targetReps: 5,
      startingWeightLb: 95,
      incrementLb: 10
    },
    barbell_curl: {
      name: "Barbell Curl",
      weighted: true,
      targetSets: 3,
      targetReps: 10,
      startingWeightLb: 45,
      incrementLb: 5
    },
    knee_raises: {
      name: "Knee Raises",
      weighted: false,
      targetSets: 3,
      targetReps: 10,
      repIncrement: 1
    }
  }
};

export function getLift(liftId) {
  const lift = PROGRAM.lifts[liftId];
  if (!lift) {
    throw new Error(`Unknown lift: ${liftId}`);
  }
  return lift;
}

export function getDayLifts(day) {
  const lifts = PROGRAM.days[day];
  if (!lifts) {
    throw new Error(`Unknown workout day: ${day}`);
  }
  return lifts;
}

export function getAllLiftIds() {
  return Object.keys(PROGRAM.lifts);
}

export function nextProgramDay(day) {
  return day === "A" ? "B" : "A";
}

export function deloadWeight(weight) {
  const raw = weight * (1 - PROGRAM.deload.percent);
  return Math.max(0, Math.floor(raw / PROGRAM.deload.roundTo) * PROGRAM.deload.roundTo);
}

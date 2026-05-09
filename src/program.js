export const PROGRAM = {
  units: "lb",
  firstDay: "A",
  deload: {
    failures: 3,
    percent: 0.1,
    roundTo: 5
  },
  plateGuide: {
    barWeightLb: 45,
    pairedPlatesLb: [45, 35, 25, 10, 5, 2.5, 1.25]
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
      incrementLb: 5,
      plateGuide: true
    },
    bench_press: {
      name: "Bench Press",
      weighted: true,
      targetSets: 5,
      targetReps: 5,
      startingWeightLb: 45,
      incrementLb: 5,
      plateGuide: true
    },
    barbell_row: {
      name: "Barbell Row",
      weighted: true,
      targetSets: 5,
      targetReps: 5,
      startingWeightLb: 45,
      incrementLb: 5,
      plateGuide: true
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
      incrementLb: 2.5,
      plateGuide: true
    },
    deadlift: {
      name: "Deadlift",
      weighted: true,
      targetSets: 1,
      targetReps: 5,
      startingWeightLb: 95,
      incrementLb: 10,
      plateGuide: true
    },
    barbell_curl: {
      name: "Barbell Curl",
      weighted: true,
      targetSets: 3,
      targetReps: 10,
      startingWeightLb: 45,
      incrementLb: 5,
      plateGuide: true
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

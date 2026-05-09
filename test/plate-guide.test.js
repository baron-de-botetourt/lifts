import assert from "node:assert/strict";
import test from "node:test";
import { calculatePlateGuide } from "../src/plate-guide.js";
import { PROGRAM } from "../src/program.js";

const config = PROGRAM.plateGuide;

test("45 pounds is the bar only", () => {
  const guide = calculatePlateGuide(45, config);

  assert.equal(guide.available, true);
  assert.equal(guide.barWeight, 45);
  assert.equal(guide.sideWeight, 0);
  assert.deepEqual(guide.platesPerSide, []);
});

test("47.5 pounds uses one and a quarter pounds per side", () => {
  const guide = calculatePlateGuide(47.5, config);

  assert.equal(guide.available, true);
  assert.equal(guide.sideWeight, 1.25);
  assert.deepEqual(guide.platesPerSide, [1.25]);
});

test("common barbell targets prefer the fewest heavier plates", () => {
  assert.deepEqual(calculatePlateGuide(95, config).platesPerSide, [25]);
  assert.deepEqual(calculatePlateGuide(135, config).platesPerSide, [45]);
  assert.deepEqual(calculatePlateGuide(225, config).platesPerSide, [45, 45]);
});

test("below-bar and incompatible targets are unavailable", () => {
  assert.deepEqual(calculatePlateGuide(10, config), {
    available: false,
    targetWeight: 10,
    barWeight: 45,
    reason: "below_bar"
  });
  assert.deepEqual(calculatePlateGuide(46, config), {
    available: false,
    targetWeight: 46,
    barWeight: 45,
    reason: "no_exact_match"
  });
});

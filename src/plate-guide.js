const UNIT_SCALE = 4;

export function calculatePlateGuide(targetWeight, config) {
  const targetUnits = toUnits(targetWeight);
  const barUnits = toUnits(config.barWeightLb);
  const plateUnits = config.pairedPlatesLb
    .map((plate) => toUnits(plate))
    .filter((plate) => plate > 0)
    .sort((left, right) => right - left);

  if (targetUnits === null || barUnits === null || plateUnits.length === 0) {
    return unavailable(config, targetWeight, "invalid_weight");
  }

  const loadedUnits = targetUnits - barUnits;
  if (loadedUnits < 0) {
    return unavailable(config, targetWeight, "below_bar");
  }

  if (loadedUnits === 0) {
    return available(config, targetWeight, 0, []);
  }

  if (loadedUnits % 2 !== 0) {
    return unavailable(config, targetWeight, "uneven_load");
  }

  const sideUnits = loadedUnits / 2;
  const platesPerSide = solveSide(sideUnits, [...new Set(plateUnits)]);
  if (!platesPerSide) {
    return unavailable(config, targetWeight, "no_exact_match");
  }

  return available(config, targetWeight, sideUnits, platesPerSide.map(fromUnits));
}

function solveSide(sideUnits, plateUnits) {
  const best = Array.from({ length: sideUnits + 1 }, () => null);
  best[0] = [];

  for (let units = 1; units <= sideUnits; units += 1) {
    for (const plateUnitsValue of plateUnits) {
      if (plateUnitsValue > units || !best[units - plateUnitsValue]) {
        continue;
      }
      const candidate = [...best[units - plateUnitsValue], plateUnitsValue]
        .sort((left, right) => right - left);
      if (isBetterPlateSet(candidate, best[units])) {
        best[units] = candidate;
      }
    }
  }

  return best[sideUnits];
}

function isBetterPlateSet(candidate, current) {
  if (!current) {
    return true;
  }
  if (candidate.length !== current.length) {
    return candidate.length < current.length;
  }
  for (let index = 0; index < candidate.length; index += 1) {
    if (candidate[index] !== current[index]) {
      return candidate[index] > current[index];
    }
  }
  return false;
}

function available(config, targetWeight, sideUnits, platesPerSide) {
  return {
    available: true,
    targetWeight,
    barWeight: config.barWeightLb,
    sideWeight: fromUnits(sideUnits),
    platesPerSide
  };
}

function unavailable(config, targetWeight, reason) {
  return {
    available: false,
    targetWeight,
    barWeight: config.barWeightLb,
    reason
  };
}

function toUnits(weight) {
  if (!Number.isFinite(weight)) {
    return null;
  }
  const units = weight * UNIT_SCALE;
  return Number.isInteger(units) ? units : null;
}

function fromUnits(units) {
  return units / UNIT_SCALE;
}

let state = null;
let timerHandle = null;

const dayLabel = document.querySelector("#day-label");
const liftCount = document.querySelector("#lift-count");
const restTimer = document.querySelector("#rest-timer");
const workoutEl = document.querySelector("#workout");
const finishButton = document.querySelector("#finish-button");
const resetButton = document.querySelector("#reset-button");

finishButton.addEventListener("click", finishWorkout);
resetButton.addEventListener("click", resetWorkout);
workoutEl.addEventListener("click", handleWorkoutClick);

loadWorkout();

async function loadWorkout() {
  try {
    state = await requestJson("/api/workout/current");
    render();
  } catch (error) {
    showError(error.message);
  }
}

async function handleWorkoutClick(event) {
  const setButton = event.target.closest("[data-set-id]");
  if (!setButton || !state || state.workout.status !== "in_progress") {
    return;
  }

  const setId = Number(setButton.dataset.setId);
  const reps = Number(setButton.dataset.reps);
  if (!Number.isInteger(setId) || !Number.isInteger(reps)) {
    return;
  }

  setButton.disabled = true;
  try {
    state = await requestJson(`/api/sets/${setId}`, {
      method: "POST",
      body: JSON.stringify({ reps })
    });
    render();
  } catch (error) {
    showError(error.message);
  }
}

async function finishWorkout() {
  if (!state || state.workout.status !== "in_progress") {
    return;
  }

  const emptySets = state.lifts.flatMap((lift) => lift.sets).filter((set) => set.reps === null).length;
  const message = emptySets > 0
    ? `Finish workout? ${emptySets} empty sets will count as missed.`
    : "Finish workout and apply progression?";
  if (!confirm(message)) {
    return;
  }

  finishButton.disabled = true;
  try {
    state = await requestJson(`/api/workout/${state.workout.id}/finish`, { method: "POST" });
    render();
  } catch (error) {
    showError(error.message);
  }
}

async function resetWorkout() {
  if (!state || state.workout.status !== "in_progress") {
    return;
  }

  if (!confirm("Reset day? All recorded sets will be cleared.")) {
    return;
  }

  resetButton.disabled = true;
  finishButton.disabled = true;
  try {
    state = await requestJson(`/api/workout/${state.workout.id}/reset`, { method: "POST" });
    render();
  } catch (error) {
    showError(error.message);
  }
}

function render() {
  const workout = state.workout;
  dayLabel.textContent = `Day ${workout.programDay}`;

  const completeLifts = state.lifts.filter(isLiftComplete).length;
  liftCount.textContent = `${completeLifts}/${state.lifts.length} lifts`;

  workoutEl.innerHTML = "";
  for (const lift of state.lifts) {
    workoutEl.append(renderLift(lift));
  }

  if (workout.status === "completed") {
    liftCount.textContent = "Saved";
    finishButton.textContent = "Workout Saved";
    finishButton.disabled = true;
    resetButton.disabled = true;
  } else {
    finishButton.textContent = "Finish Workout";
    finishButton.disabled = false;
    resetButton.disabled = false;
  }

  startTimer();
}

function renderLift(lift) {
  const section = document.createElement("section");
  section.className = `lift ${isLiftComplete(lift) ? "lift-complete" : ""}`;

  const head = document.createElement("div");
  head.className = "lift-head";

  const title = document.createElement("h2");
  title.textContent = lift.name;
  head.append(title);

  const target = document.createElement("span");
  target.className = "target";
  target.textContent = targetText(lift);
  head.append(target);

  section.append(head);

  const sets = document.createElement("div");
  sets.className = "sets";
  for (const set of lift.sets) {
    sets.append(renderSet(lift, set));
  }
  section.append(sets);

  return section;
}

function renderSet(lift, set) {
  if (set.reps === null) {
    const button = document.createElement("button");
    button.className = "set-pill set-empty";
    button.type = "button";
    button.dataset.setId = set.id;
    button.dataset.reps = lift.targetReps;
    button.textContent = lift.targetReps;
    button.setAttribute("aria-label", `${lift.name} set ${set.setNumber}, record ${lift.targetReps} reps`);
    return button;
  }

  const pill = document.createElement("div");
  pill.className = set.reps >= lift.targetReps ? "set-pill set-done" : "set-pill set-miss";

  const minus = document.createElement("button");
  minus.type = "button";
  minus.className = "set-adjust";
  minus.dataset.setId = set.id;
  minus.dataset.reps = Math.max(0, set.reps - 1);
  minus.textContent = "-";
  minus.setAttribute("aria-label", `Decrease set ${set.setNumber}`);

  const value = document.createElement("span");
  value.className = "set-value";
  value.textContent = set.reps;

  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = "set-adjust";
  plus.dataset.setId = set.id;
  plus.dataset.reps = Math.min(99, set.reps + 1);
  plus.textContent = "+";
  plus.setAttribute("aria-label", `Increase set ${set.setNumber}`);

  pill.append(minus, value, plus);
  return pill;
}

function targetText(lift) {
  const base = `${lift.targetSets}x${lift.targetReps}`;
  if (!lift.weighted) {
    return base;
  }
  return `${base} @ ${formatWeight(lift.targetWeight)} ${state.units}`;
}

function formatWeight(weight) {
  return Number.isInteger(weight) ? String(weight) : String(Number(weight.toFixed(1)));
}

function isLiftComplete(lift) {
  return lift.sets.every((set) => set.reps !== null && set.reps >= lift.targetReps);
}

function startTimer() {
  if (timerHandle) {
    clearInterval(timerHandle);
  }
  updateTimer();
  timerHandle = setInterval(updateTimer, 1000);
}

function updateTimer() {
  if (!state?.lastSetCompletedAt) {
    restTimer.textContent = "Ready";
    return;
  }
  const elapsed = Math.max(0, Date.now() - Date.parse(state.lastSetCompletedAt));
  restTimer.textContent = formatDuration(elapsed);
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });
  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("Authentication required");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return response.json();
}

function showError(message) {
  workoutEl.innerHTML = "";
  const error = document.createElement("p");
  error.className = "error";
  error.textContent = message;
  workoutEl.append(error);
}

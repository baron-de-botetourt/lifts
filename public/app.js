let state = null;
let timerHandle = null;
let plateGuideReturnFocus = null;
const PLATE_GUIDE_WEIGHTS = [45, 35, 25, 10, 5, 2.5, 1.25];

const dayLabel = document.querySelector("#day-label");
const liftCount = document.querySelector("#lift-count");
const restTimer = document.querySelector("#rest-timer");
const workoutEl = document.querySelector("#workout");
const finishButton = document.querySelector("#finish-button");
const resetButton = document.querySelector("#reset-button");
const plateGuideModal = document.querySelector("#plate-guide-modal");

finishButton.addEventListener("click", finishWorkout);
resetButton.addEventListener("click", resetWorkout);
workoutEl.addEventListener("click", handleWorkoutClick);
plateGuideModal.addEventListener("click", handlePlateGuideModalClick);
document.addEventListener("keydown", handleKeyDown);

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
  const guideButton = event.target.closest("[data-plate-lift-id]");
  if (guideButton && state) {
    openPlateGuide(guideButton.dataset.plateLiftId);
    return;
  }

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

  const target = lift.plateGuide ? document.createElement("button") : document.createElement("span");
  target.className = lift.plateGuide ? "target target-button" : "target";
  target.textContent = targetText(lift);
  if (lift.plateGuide) {
    target.type = "button";
    target.dataset.plateLiftId = lift.liftId;
    target.setAttribute("aria-label", `Show plates for ${lift.name} at ${formatWeight(lift.targetWeight)} ${state.units}`);
  }
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

function openPlateGuide(liftId) {
  const lift = state.lifts.find((candidate) => candidate.liftId === liftId);
  if (!lift?.plateGuide) {
    return;
  }

  plateGuideReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  renderPlateGuideModal(lift);
}

function renderPlateGuideModal(lift) {
  const guide = lift.plateGuide;
  const backdrop = document.createElement("div");
  backdrop.className = "plate-guide-backdrop";
  backdrop.dataset.plateGuideClose = "true";

  const sheet = document.createElement("section");
  sheet.className = "plate-guide-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-labelledby", "plate-guide-title");

  const head = document.createElement("div");
  head.className = "plate-guide-head";

  const titleBlock = document.createElement("div");
  const title = document.createElement("h2");
  title.id = "plate-guide-title";
  title.textContent = lift.name;
  const target = document.createElement("p");
  target.textContent = `${formatWeight(guide.targetWeight)} ${state.units}`;
  titleBlock.append(title, target);

  const close = document.createElement("button");
  close.className = "plate-guide-close";
  close.type = "button";
  close.textContent = "X";
  close.dataset.plateGuideClose = "true";
  close.setAttribute("aria-label", "Close plate guide");

  head.append(titleBlock, close);
  sheet.append(head);

  if (!guide.available) {
    const note = document.createElement("p");
    note.className = "plate-guide-note";
    note.textContent = "This weight cannot be loaded exactly with the configured bar and plates.";
    sheet.append(note);
  } else {
    sheet.append(renderPlateStack(guide));
  }

  plateGuideModal.replaceChildren(backdrop, sheet);
  plateGuideModal.hidden = false;
  close.focus({ preventScroll: true });
}

function renderPlateStack(guide) {
  const stack = document.createElement("div");
  stack.className = "plate-stack";

  if (guide.platesPerSide.length === 0) {
    const value = document.createElement("strong");
    value.textContent = "No plates";
    stack.append(value);
    return stack;
  }

  const counts = new Map();
  for (const plate of guide.platesPerSide) {
    counts.set(plate, (counts.get(plate) || 0) + 1);
  }

  for (const plate of PLATE_GUIDE_WEIGHTS) {
    const slot = document.createElement("div");
    slot.className = "plate-slot";
    const count = counts.get(plate) || 0;
    if (count === 0) {
      slot.classList.add("plate-slot-empty");
      slot.setAttribute("aria-hidden", "true");
    } else {
      const chip = document.createElement("strong");
      chip.className = "plate-chip";
      chip.dataset.plateWeight = String(plate).replace(".", "_");
      chip.textContent = formatWeight(plate);
      if (count > 1) {
        const badge = document.createElement("span");
        badge.textContent = `x${count}`;
        chip.append(badge);
        chip.setAttribute("aria-label", `${formatWeight(plate)} pounds times ${count}`);
      }
      slot.append(chip);
    }
    stack.append(slot);
  }

  return stack;
}

function handlePlateGuideModalClick(event) {
  if (event.target.closest("[data-plate-guide-close]")) {
    closePlateGuide();
  }
}

function handleKeyDown(event) {
  if (event.key === "Escape" && !plateGuideModal.hidden) {
    closePlateGuide();
  }
}

function closePlateGuide() {
  if (plateGuideModal.hidden) {
    return;
  }
  plateGuideModal.hidden = true;
  plateGuideModal.replaceChildren();
  if (plateGuideReturnFocus) {
    plateGuideReturnFocus.focus({ preventScroll: true });
    plateGuideReturnFocus = null;
  }
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

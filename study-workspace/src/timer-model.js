export const TIMER_PRESETS = [
  { label: "25 min", seconds: 25 * 60 },
  { label: "50 min", seconds: 50 * 60 },
];

export const MIN_CUSTOM_MINUTES = 1;
export const MAX_CUSTOM_MINUTES = 180;
export const MIN_LOGGED_SESSION_MS = 5000;

export function normalizeTimerLength(seconds) {
  return Number.isSafeInteger(seconds) && seconds >= MIN_CUSTOM_MINUTES * 60 && seconds <= MAX_CUSTOM_MINUTES * 60
    ? seconds
    : TIMER_PRESETS[0].seconds;
}

export function parseCustomMinutes(value) {
  const minutes = Number(value);
  if (
    !Number.isSafeInteger(minutes) ||
    minutes < MIN_CUSTOM_MINUTES ||
    minutes > MAX_CUSTOM_MINUTES
  ) {
    return null;
  }
  return minutes * 60;
}

export function remainingMilliseconds(deadlineMs, pausedRemainingMs, nowMs = Date.now()) {
  return Math.max(0, pausedRemainingMs ?? deadlineMs - nowMs);
}

export function remainingSeconds(deadlineMs, pausedRemainingMs, nowMs = Date.now()) {
  return Math.ceil(remainingMilliseconds(deadlineMs, pausedRemainingMs, nowMs) / 1000);
}

export function elapsedMilliseconds(startedAtMs, pausedElapsedMs, nowMs = Date.now()) {
  return Math.max(0, pausedElapsedMs ?? nowMs - startedAtMs);
}

export function timerProgress(deadlineMs, plannedSec, pausedRemainingMs, nowMs = Date.now()) {
  if (!Number.isFinite(plannedSec) || plannedSec <= 0) return 0;
  return Math.min(
    1,
    remainingMilliseconds(deadlineMs, pausedRemainingMs, nowMs) / (plannedSec * 1000),
  );
}

export function formatTimer(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function createSessionRecord({
  courseId,
  startedAt,
  plannedSec,
  actualMs,
  completed,
  countUp = false,
  id = crypto.randomUUID(),
}) {
  if (
    !Number.isSafeInteger(plannedSec) ||
    (countUp ? plannedSec !== 0 || completed : plannedSec <= 0) ||
    !Number.isFinite(actualMs) ||
    actualMs < MIN_LOGGED_SESSION_MS
  ) {
    return null;
  }

  const actualSec = countUp
    ? Math.floor(actualMs / 1000)
    : completed
      ? plannedSec
      : Math.min(plannedSec, Math.floor(actualMs / 1000));
  if (actualSec === 0) return null;

  return {
    id,
    courseId,
    startedAt,
    plannedSec,
    actualSec,
    completed,
    countUp,
    summary: null,
  };
}

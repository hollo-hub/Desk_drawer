export const MAX_FOCUS_DURATION_MINUTES = 10_080;

export const DEFAULT_FOCUS_TIMER_SETTINGS = Object.freeze({
  schemaVersion: 1,
  durationMinutes: 25,
  textColor: null,
});

export function isValidFocusDuration(minutes) {
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_FOCUS_DURATION_MINUTES;
}

export function formatFocusDuration(totalSeconds) {
  if (!Number.isInteger(totalSeconds) || totalSeconds < 0) {
    throw new TypeError('Remaining timer seconds must be a non-negative integer.');
  }
  if (totalSeconds >= 3600) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

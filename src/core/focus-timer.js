export const MAX_FOCUS_DURATION_MINUTES = 10_080;

export const DEFAULT_FOCUS_TIMER_SETTINGS = Object.freeze({
  schemaVersion: 1,
  durationMinutes: 25,
  textColor: null,
  breakReminder: true,
});

export function isValidFocusDuration(minutes) {
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_FOCUS_DURATION_MINUTES;
}

export class FocusSession {
  constructor(now = Date.now) {
    this.now = now;
    this.deadline = 0;
    this.totalSeconds = 0;
    this.running = false;
    this.completed = false;
    this.breakReminder = true;
  }

  start(minutes, breakReminder = true) {
    if (!isValidFocusDuration(minutes)) {
      throw new RangeError(`Focus duration must be from 1 to ${MAX_FOCUS_DURATION_MINUTES} minutes.`);
    }
    if (typeof breakReminder !== 'boolean') {
      throw new TypeError('Break reminder setting must be a boolean.');
    }
    this.totalSeconds = minutes * 60;
    this.deadline = this.now() + this.totalSeconds * 1000;
    this.running = true;
    this.completed = false;
    this.breakReminder = breakReminder;
  }

  get state() {
    const remainingSeconds = this.running
      ? Math.max(0, Math.ceil((this.deadline - this.now()) / 1000))
      : 0;
    return {
      running: this.running,
      totalSeconds: this.totalSeconds,
      remainingSeconds,
      fraction: this.totalSeconds ? remainingSeconds / this.totalSeconds : 1,
      completed: this.completed,
      breakReminder: this.breakReminder,
    };
  }

  tick() {
    if (!this.running || this.state.remainingSeconds > 0) return false;
    this.running = false;
    this.deadline = 0;
    this.completed = true;
    return true;
  }

  stop() {
    if (!this.running) return false;
    this.running = false;
    this.deadline = 0;
    this.totalSeconds = 0;
    this.completed = false;
    return true;
  }
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

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FocusSession,
  formatFocusDuration,
  isValidFocusDuration,
  MAX_FOCUS_DURATION_MINUTES,
} from '../src/core/focus-timer.js';

test('focus session counts down from one minute and completes once', () => {
  let now = 0;
  const session = new FocusSession(() => now);
  session.start(1);

  assert.equal(session.state.remainingSeconds, 60);
  now = 59_000;
  assert.equal(session.state.remainingSeconds, 1);
  assert.equal(session.tick(), false);
  now = 60_000;
  assert.equal(session.state.fraction, 0);
  assert.equal(session.tick(), true);
  assert.equal(session.tick(), false);
  assert.equal(session.state.completed, true);
});

test('focus session supports the seven-day maximum and manual stop', () => {
  let now = 0;
  const session = new FocusSession(() => now);
  session.start(MAX_FOCUS_DURATION_MINUTES, false);

  assert.equal(session.state.totalSeconds, 604_800);
  assert.equal(formatFocusDuration(session.state.remainingSeconds), '168:00:00');
  now += 604_800_000;
  assert.equal(session.tick(), true);

  session.start(25);
  assert.equal(session.stop(), true);
  assert.equal(session.state.running, false);
  assert.equal(session.state.completed, false);
});

test('focus duration validation rejects values outside one minute to seven days', () => {
  assert.equal(isValidFocusDuration(1), true);
  assert.equal(isValidFocusDuration(MAX_FOCUS_DURATION_MINUTES), true);
  assert.equal(isValidFocusDuration(0), false);
  assert.equal(isValidFocusDuration(1.5), false);
  assert.equal(isValidFocusDuration(MAX_FOCUS_DURATION_MINUTES + 1), false);
  assert.throws(() => new FocusSession().start(0), RangeError);
});

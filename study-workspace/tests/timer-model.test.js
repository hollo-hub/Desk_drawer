import test from "node:test";
import assert from "node:assert/strict";
import {
  createSessionRecord,
  elapsedMilliseconds,
  formatTimer,
  normalizeTimerLength,
  parseCustomMinutes,
  remainingMilliseconds,
  remainingSeconds,
  timerProgress,
  TIMER_PRESETS,
} from "../src/timer-model.js";

test("production timer lengths are 25 minutes, 50 minutes, or a custom whole minute", () => {
  assert.deepEqual(
    TIMER_PRESETS.map((preset) => preset.seconds),
    [25 * 60, 50 * 60],
  );
  assert.equal(parseCustomMinutes("1"), 60);
  assert.equal(parseCustomMinutes("180"), 10_800);
  assert.equal(parseCustomMinutes("1.5"), null);
  assert.equal(parseCustomMinutes("0"), null);
  assert.equal(parseCustomMinutes("181"), null);
  assert.equal(normalizeTimerLength(25 * 60), 25 * 60);
  assert.equal(normalizeTimerLength(50 * 60), 50 * 60);
  assert.equal(normalizeTimerLength(15), 25 * 60);
});

test("remaining time is derived from the deadline and remains frozen while paused", () => {
  const deadline = 20_000;
  assert.equal(remainingMilliseconds(deadline, null, 12_500), 7_500);
  assert.equal(remainingSeconds(deadline, null, 12_500), 8);

  const pausedRemaining = remainingMilliseconds(deadline, null, 12_500);
  assert.equal(remainingMilliseconds(deadline, pausedRemaining, 50_000), 7_500);

  const resumedDeadline = 50_000 + pausedRemaining;
  assert.equal(remainingMilliseconds(resumedDeadline, null, 52_500), 5_000);
  assert.equal(remainingMilliseconds(resumedDeadline, null, 60_000), 0);
});

test("stopwatch elapsed time follows timestamps and freezes while paused", () => {
  const startedAt = 10_000;
  const pausedElapsed = elapsedMilliseconds(startedAt, null, 12_500);

  assert.equal(pausedElapsed, 2_500);
  assert.equal(elapsedMilliseconds(startedAt, pausedElapsed, 99_000), 2_500);

  const resumedStart = 50_000 - pausedElapsed;
  assert.equal(elapsedMilliseconds(resumedStart, null, 52_000), 4_500);
});

test("halo progress follows deadline time and stays fixed while paused", () => {
  const durationSec = 60;
  const deadline = 70_000;
  assert.equal(timerProgress(deadline, durationSec, null, 10_000), 1);
  assert.equal(timerProgress(deadline, durationSec, null, 40_000), 0.5);

  const pausedRemaining = remainingMilliseconds(deadline, null, 40_000);
  assert.equal(timerProgress(deadline, durationSec, pausedRemaining, 90_000), 0.5);
  const resumedDeadline = 90_000 + pausedRemaining;
  assert.equal(timerProgress(resumedDeadline, durationSec, null, 90_000), 0.5);
  assert.equal(timerProgress(resumedDeadline, durationSec, null, 105_000), 0.25);
  assert.equal(timerProgress(70_000, durationSec, null, 70_000), 0);
  assert.equal(timerProgress(70_000, 0, null, 40_000), 0);
});

test("timer display formats zero, minute boundaries, and durations over an hour", () => {
  assert.equal(formatTimer(0), "00:00");
  assert.equal(formatTimer(59), "00:59");
  assert.equal(formatTimer(60), "01:00");
  assert.equal(formatTimer(3661), "61:01");
});

test("sessions under five seconds are omitted and longer sessions record actual seconds", () => {
  const input = {
    id: "session-1",
    courseId: "course-1",
    startedAt: "2026-10-24T10:00:00.000Z",
    plannedSec: 25 * 60,
    completed: false,
  };

  assert.equal(createSessionRecord({ ...input, actualMs: 4999 }), null);
  assert.deepEqual(createSessionRecord({ ...input, actualMs: 5500 }), {
    ...input,
    actualSec: 5,
    countUp: false,
    summary: null,
  });
});

test("stopwatch sessions start with no plan and record their elapsed duration", () => {
  const input = {
    id: "session-stopwatch",
    courseId: "course-1",
    startedAt: "2026-10-24T10:00:00.000Z",
    plannedSec: 0,
    actualMs: 61_999,
    completed: false,
    countUp: true,
  };

  const { actualMs, ...sessionInput } = input;
  assert.deepEqual(createSessionRecord(input), {
    ...sessionInput,
    actualSec: 61,
    summary: null,
  });
  assert.equal(createSessionRecord({ ...input, completed: true }), null);
  assert.equal(createSessionRecord({ ...input, plannedSec: 60 }), null);
});

test("completed sessions log the planned length exactly", () => {
  const session = createSessionRecord({
    id: "session-2",
    courseId: "course-1",
    startedAt: "2026-10-24T10:00:00.000Z",
    plannedSec: 900,
    actualMs: 905_000,
    completed: true,
  });

  assert.equal(session.actualSec, 900);
  assert.equal(session.completed, true);
  assert.equal(session.countUp, false);
});

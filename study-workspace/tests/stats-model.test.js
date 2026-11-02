import test from "node:test";
import assert from "node:assert/strict";
import { longestStudyStreak, minutesByCourse, weekStart } from "../src/stats-model.js";

test("stats weeks begin Monday at local midnight", () => {
  assert.equal(weekStart(new Date(2026, 0, 7, 14)).getTime(), new Date(2026, 0, 5).getTime());
});

test("weekly minutes include only sessions in the requested local week", () => {
  const courses = [{ id: "a", name: "Biology" }, { id: "b", name: "History" }];
  const sessions = [
    { courseId: "a", startedAt: new Date(2026, 0, 5, 0).toISOString(), actualSec: 3600 },
    { courseId: "a", startedAt: new Date(2026, 0, 4, 23, 59).toISOString(), actualSec: 1800 },
    { courseId: "b", startedAt: new Date(2025, 11, 29, 12).toISOString(), actualSec: 7200 },
  ];
  assert.deepEqual(minutesByCourse(courses, sessions, 0, new Date(2026, 0, 7)), [
    { courseId: "a", courseName: "Biology", minutes: 60 },
    { courseId: "b", courseName: "History", minutes: 0 },
  ]);
  assert.deepEqual(minutesByCourse(courses, sessions, 1, new Date(2026, 0, 7)), [
    { courseId: "a", courseName: "Biology", minutes: 30 },
    { courseId: "b", courseName: "History", minutes: 120 },
  ]);
});

test("study streak counts distinct consecutive local calendar days", () => {
  const sessions = [
    { startedAt: "2026-01-01T09:00:00" },
    { startedAt: "2026-01-01T17:00:00" },
    { startedAt: "2026-01-02T09:00:00" },
    { startedAt: "2026-01-04T09:00:00" },
  ];
  assert.equal(longestStudyStreak(sessions), 2);
  assert.equal(longestStudyStreak([]), 0);
});

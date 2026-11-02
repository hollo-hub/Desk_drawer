import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRecallGrid, createReviewItem, dueReviews, groupTasksByDue, nextInterleavedCourse,
  prospectiveTimetable, rateReview, taskReminder, DAY_MS,
} from "../src/study/study-model.js";
import { localDateInputToEnd } from "../src/date-model.js";

const at = (y, m, d, h = 9) => new Date(y, m - 1, d, h);
const base = () => createReviewItem({ id: "r1", courseId: "c1", unitId: "u1", prompt: "What does Ohm's law relate?", now: at(2026, 11, 1) });

test("review items need a prompt and start in box 1, due now", () => {
  assert.throws(() => createReviewItem({ id: "x", courseId: "c1", prompt: "  ", now: new Date() }));
  const item = base();
  assert.equal(item.box, 1);
  assert.equal(item.dueAt, at(2026, 11, 1).toISOString());
});

test("green climbs the Leitner boxes on 1, 3, 7, 14 day gaps", () => {
  let item = base();
  const now = at(2026, 11, 1);
  const gaps = [];
  for (let i = 0; i < 3; i += 1) {
    item = rateReview(item, "green", now);
    gaps.push(Math.round((new Date(item.dueAt) - now) / DAY_MS));
  }
  assert.deepEqual(gaps, [3, 7, 14]);
  assert.equal(item.box, 4);
});

test("yellow repeats the box and red falls back", () => {
  let item = { ...base(), box: 3 };
  const now = at(2026, 11, 1);
  assert.equal(rateReview(item, "yellow", now).box, 3);
  assert.equal(rateReview(item, "red", now).box, 1);
  assert.equal(rateReview(item, "red", now, { failPenalty: "back-one" }).box, 2);
  assert.throws(() => rateReview(item, "purple", now));
});

test("rating never mutates the item and logs history", () => {
  const item = base();
  const next = rateReview(item, "green", at(2026, 11, 1));
  assert.equal(item.history.length, 0);
  assert.equal(next.history.length, 1);
  assert.equal(next.history[0].rating, "green");
});

test("the top box is scheduled for the day before the exam and nothing runs past it", () => {
  const exam = at(2026, 11, 20);
  const now = at(2026, 11, 1);
  const top = rateReview({ ...base(), box: 4 }, "green", now, { examAt: exam });
  assert.equal(top.box, 5);
  assert.equal(top.dueAt, new Date(exam.getTime() - DAY_MS).toISOString());
  const early = rateReview({ ...base(), box: 3 }, "green", at(2026, 11, 15), { examAt: exam });
  assert.ok(new Date(early.dueAt) <= new Date(exam.getTime() - DAY_MS));
  const tooLate = rateReview(base(), "green", at(2026, 11, 20), { examAt: exam });
  assert.ok(new Date(tooLate.dueAt) >= at(2026, 11, 20));
});

test("due reviews list weak items first, then the longest overdue", () => {
  const now = at(2026, 11, 10);
  const mk = (id, rating, dueDay) => ({ ...base(), id, dueAt: at(2026, 11, dueDay).toISOString(), history: [{ at: now.toISOString(), rating, box: 1 }] });
  const items = [mk("g", "green", 2), mk("r-late", "red", 3), mk("r-early", "red", 9), mk("future", "red", 20)];
  assert.deepEqual(dueReviews(items, now).map((i) => i.id), ["r-late", "r-early", "g"]);
});

test("the prospective timetable doubles the gap and stops before the exam", () => {
  const table = prospectiveTimetable({ topics: [{ id: "t1", title: "Ohm" }], startAt: at(2026, 11, 1), examAt: at(2026, 11, 30) });
  assert.deepEqual(table.map((e) => e.date), ["2026-11-01", "2026-11-02", "2026-11-04", "2026-11-08", "2026-11-16"]);
  const near = prospectiveTimetable({ topics: [{ id: "t1", title: "Ohm" }], startAt: at(2026, 11, 1), examAt: at(2026, 11, 5) });
  assert.deepEqual(near.map((e) => e.date), ["2026-11-01", "2026-11-02", "2026-11-04"]);
  const dateOnlyExam = localDateInputToEnd("2026-11-05");
  const beforeExam = prospectiveTimetable({ topics: [{ id: "t1", title: "Ohm" }], startAt: at(2026, 11, 1), examAt: dateOnlyExam });
  assert.equal(beforeExam.some((entry) => entry.date === "2026-11-05"), false);
});

test("new topics start on consecutive days", () => {
  const table = prospectiveTimetable({ topics: [{ id: "a", title: "A" }, { id: "b", title: "B" }], startAt: at(2026, 11, 1), examAt: at(2026, 12, 31), maxSessions: 2 });
  assert.deepEqual(table.map((e) => `${e.date}:${e.topicId}${e.session}`), ["2026-11-01:a1", "2026-11-02:a2", "2026-11-02:b1", "2026-11-03:b2"]);
});

test("the recall grid uses the weakest rating per unit per day", () => {
  const item = { ...base(), history: [
    { at: at(2026, 11, 1, 8).toISOString(), rating: "green", box: 2 },
    { at: at(2026, 11, 1, 20).toISOString(), rating: "red", box: 1 },
    { at: at(2026, 11, 3).toISOString(), rating: "yellow", box: 1 },
  ] };
  const grid = buildRecallGrid([item], [{ id: "u1", title: "Ohm" }, { id: "u2", title: "Kirchhoff" }]);
  assert.deepEqual(grid.dates, ["2026-11-01", "2026-11-03"]);
  assert.deepEqual(grid.rows[0].cells.map((c) => c.rating), ["red", "yellow"]);
  assert.deepEqual(grid.rows[1].cells.map((c) => c.rating), [null, null]);
});

test("interleaving never repeats the last course and prefers the least recent", () => {
  const sessions = [
    { courseId: "a", startedAt: at(2026, 11, 1).toISOString() },
    { courseId: "b", startedAt: at(2026, 11, 2).toISOString() },
    { courseId: "c", startedAt: at(2026, 11, 3).toISOString() },
  ];
  assert.equal(nextInterleavedCourse(sessions, ["a", "b", "c"]), "a");
  assert.equal(nextInterleavedCourse([], ["a", "b"]), "a");
  assert.equal(nextInterleavedCourse(sessions, ["c"]), "c");
  assert.equal(nextInterleavedCourse(sessions, []), null);
  assert.equal(nextInterleavedCourse(sessions, ["a", "d"]), "d");
});

test("tasks group by deadline and skip completed ones", () => {
  const now = at(2026, 11, 4, 12);
  const task = (id, due, completed = false) => ({ id, title: id, completed, dueAt: due?.toISOString() });
  const groups = groupTasksByDue([
    task("late", at(2026, 11, 2)), task("today", at(2026, 11, 4, 18)), task("week", at(2026, 11, 8)),
    task("later", at(2026, 12, 1)), task("none", null), task("done", at(2026, 11, 1), true),
  ], now);
  assert.deepEqual(Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.map((t) => t.id)])), {
    overdue: ["late"], today: ["today"], thisWeek: ["week"], later: ["later"], noDate: ["none"],
  });
});

test("date-only task deadlines remain due today until the local day ends", () => {
  const dueAt = localDateInputToEnd("2026-11-04");
  const groups = groupTasksByDue([{ id: "today", dueAt, completed: false }], at(2026, 11, 4, 12));

  assert.equal(groups.today[0].id, "today");
  assert.equal(groups.overdue.length, 0);
});

test("task reminders say how late or how soon", () => {
  const now = at(2026, 11, 4, 12);
  const task = (due) => ({ id: "t", completed: false, dueAt: due.toISOString() });
  assert.equal(taskReminder(task(at(2026, 11, 2, 12)), now).label, "2 days late");
  assert.equal(taskReminder(task(at(2026, 11, 4, 9)), now).label, "3 hours late");
  assert.equal(taskReminder(task(at(2026, 11, 4, 15)), now).label, "Due in 3 hours");
  assert.equal(taskReminder(task(at(2026, 11, 9)), now), null);
  assert.equal(taskReminder({ completed: true, dueAt: now.toISOString() }, now), null);
  assert.equal(taskReminder({ completed: false }, now), null);
});

// Study engine for v3. Pure functions only: no DOM, no storage, no clock access
// (callers pass `now`), so every rule here is unit tested.
//
// Methods follow the techniques in Jun Yuh's "The Guide to Academic Success"
// (Leitner boxes, doubling revision timetable, retrospective colour grid,
// interleaving). The code is original; the guide's wording is not reproduced.

import { addLocalDays, localDateKey, localStartOfDay, previousLocalDay } from "../date-model.js";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const RATINGS = ["red", "yellow", "green"]; // poor, adequate, sufficient recall
// Boxes 1-4 repeat on these gaps; the last box means "review the day before the exam".
export const DEFAULT_BOX_DAYS = [1, 3, 7, 14];

const asDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("A valid date is required.");
  return date;
};
const iso = (value) => asDate(value).toISOString();

export function createReviewItem({ id, courseId, unitId = null, sourceId = null, prompt, now }) {
  if (!id || !courseId || !prompt?.trim()) throw new Error("A review item needs an id, a course, and a prompt.");
  return {
    id,
    courseId,
    unitId,
    sourceId,
    prompt: prompt.trim(),
    box: 1,
    dueAt: iso(now), // a new question is first recalled right away
    createdAt: iso(now),
    history: [],
  };
}

// Rates one recall attempt and returns the updated item (the input is not mutated).
// green moves up a box, yellow repeats the box, red falls back (to box 1 by default,
// or one box with failPenalty "back-one", as the guide allows).
export function rateReview(item, rating, now, { examAt = null, boxDays = DEFAULT_BOX_DAYS, failPenalty = "reset" } = {}) {
  if (!RATINGS.includes(rating)) throw new Error(`Unknown rating: ${rating}`);
  const examBox = boxDays.length + 1;
  let box = item.box;
  if (rating === "green") box = Math.min(box + 1, examBox);
  else if (rating === "red") box = failPenalty === "back-one" ? Math.max(1, box - 1) : 1;

  const nowMs = asDate(now).getTime();
  let dueMs;
  if (box < examBox) dueMs = nowMs + boxDays[box - 1] * DAY_MS;
  else dueMs = nowMs + boxDays[boxDays.length - 1] * 2 * DAY_MS; // no exam date: a long gap
  if (examAt) {
    const dayBeforeExam = previousLocalDay(asDate(examAt)).getTime();
    dueMs = box === examBox ? dayBeforeExam : Math.min(dueMs, dayBeforeExam);
    dueMs = Math.max(dueMs, nowMs); // never schedule into the past
  }
  return {
    ...item,
    box,
    dueAt: new Date(dueMs).toISOString(),
    history: [...item.history, { at: iso(now), rating, box }],
  };
}

const lastRating = (item) => item.history.at(-1)?.rating ?? "yellow";
const RANK = { red: 0, yellow: 1, green: 2 };

// Items due now, weakest first, then longest overdue (the guide's two questions:
// how long since I studied it, and how well did I recall it).
export function dueReviews(items, now) {
  const nowMs = asDate(now).getTime();
  return items
    .filter((item) => new Date(item.dueAt).getTime() <= nowMs)
    .sort((a, b) => RANK[lastRating(a)] - RANK[lastRating(b)] || new Date(a.dueAt) - new Date(b.dueAt));
}

// Prospective revision timetable: each topic is first studied on its own day, then revisited with a
// gap that doubles each time (days 1, 2, 4, 8, 16, ... counting from the first study day).
export function prospectiveTimetable({ topics, startAt, examAt, maxSessions = 6 }) {
  const start = asDate(startAt);
  const examDate = localDateKey(examAt);
  const entries = [];
  topics.forEach((topic, index) => {
    for (let n = 1; n <= maxSessions; n += 1) {
      const offsetDays = index + 2 ** (n - 1) - 1;
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offsetDays);
      if (localDateKey(day) >= examDate) break;
      entries.push({ topicId: topic.id, title: topic.title, date: localDateKey(day), session: n });
    }
  });
  // On a shared day, revisits come before new material (retrieve first, then learn).
  return entries.sort((a, b) => a.date.localeCompare(b.date) || b.session - a.session);
}

// Retrospective grid: one row per unit, one cell per study day, coloured by recall.
// If a unit was rated more than once in a day, the weakest rating wins.
export function buildRecallGrid(items, units) {
  const byUnit = new Map(units.map((unit) => [unit.id, new Map()]));
  const dates = new Set();
  for (const item of items) {
    const cells = byUnit.get(item.unitId);
    if (!cells) continue;
    for (const entry of item.history) {
      const key = localDateKey(entry.at);
      dates.add(key);
      const prior = cells.get(key);
      if (!prior || RANK[entry.rating] < RANK[prior]) cells.set(key, entry.rating);
    }
  }
  const sorted = [...dates].sort();
  return {
    dates: sorted,
    rows: units.map((unit) => ({
      unitId: unit.id,
      title: unit.title,
      cells: sorted.map((date) => ({ date, rating: byUnit.get(unit.id).get(date) ?? null })),
    })),
  };
}

// Interleaving: suggest the course studied least recently, never the same one twice in a row.
export function nextInterleavedCourse(sessions, courseIds) {
  if (courseIds.length === 0) return null;
  const lastCourse = [...sessions].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))[0]?.courseId;
  const lastSeen = new Map(courseIds.map((id) => [id, -Infinity]));
  for (const session of sessions) {
    if (lastSeen.has(session.courseId)) lastSeen.set(session.courseId, Math.max(lastSeen.get(session.courseId), new Date(session.startedAt).getTime()));
  }
  const candidates = courseIds.length > 1 ? courseIds.filter((id) => id !== lastCourse) : courseIds;
  return candidates.sort((a, b) => lastSeen.get(a) - lastSeen.get(b))[0];
}

// Lean task list: group open tasks by deadline.
export function groupTasksByDue(tasks, now) {
  const currentTime = asDate(now).getTime();
  const startOfToday = localStartOfDay(now);
  const startOfTomorrow = addLocalDays(startOfToday, 1).getTime();
  const startOfNextWeek = addLocalDays(startOfToday, 7).getTime();
  const groups = { overdue: [], today: [], thisWeek: [], later: [], noDate: [] };
  for (const task of tasks) {
    if (task.completed) continue;
    if (!task.dueAt) { groups.noDate.push(task); continue; }
    const due = asDate(task.dueAt).getTime();
    if (due < currentTime) groups.overdue.push(task);
    else if (due < startOfTomorrow) groups.today.push(task);
    else if (due < startOfNextWeek) groups.thisWeek.push(task);
    else groups.later.push(task);
  }
  const byDue = (a, b) => asDate(a.dueAt) - asDate(b.dueAt);
  for (const key of ["overdue", "today", "thisWeek", "later"]) groups[key].sort(byDue);
  return groups;
}

// A short reminder for a task that is late or about to be (null when no nudge is needed).
export function taskReminder(task, now) {
  if (task.completed || !task.dueAt) return null;
  const diff = asDate(task.dueAt).getTime() - asDate(now).getTime();
  const plural = (n, unit) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (diff < 0) {
    const late = -diff;
    const label = late >= DAY_MS ? plural(Math.floor(late / DAY_MS), "day") : late >= 3600000 ? plural(Math.floor(late / 3600000), "hour") : "just now";
    return { kind: "overdue", label: label === "just now" ? "Due just now" : `${label} late` };
  }
  if (diff <= DAY_MS) {
    const label = diff >= 3600000 ? plural(Math.floor(diff / 3600000), "hour") : plural(Math.max(1, Math.floor(diff / 60000)), "minute");
    return { kind: "due-soon", label: `Due in ${label}` };
  }
  return null;
}

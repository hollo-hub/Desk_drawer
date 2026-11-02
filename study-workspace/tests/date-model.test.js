import assert from "node:assert/strict";
import test from "node:test";
import { addLocalDays, localDateInputToEnd, localDateKey, localStartOfDay } from "../src/date-model.js";

test("calendar dates become local end-of-day timestamps", () => {
  const dueAt = localDateInputToEnd("2026-03-08");
  const due = new Date(dueAt);

  assert.equal(localDateKey(due), "2026-03-08");
  assert.equal(due.getHours(), 23);
  assert.equal(due.getMinutes(), 59);
  assert.equal(due.getSeconds(), 59);
  assert.equal(due.getMilliseconds(), 999);
  assert.equal(localDateInputToEnd("2026-02-31"), null);
  assert.equal(localDateInputToEnd(""), null);
});

test("local calendar arithmetic preserves the selected local time", () => {
  const start = localStartOfDay(new Date(2026, 2, 8, 15, 30));
  const nextDay = addLocalDays(start, 1);

  assert.equal(localDateKey(start), "2026-03-08");
  assert.equal(localDateKey(nextDay), "2026-03-09");
  assert.equal(nextDay.getHours(), 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  createCourseNote,
  MAX_NOTE_CONTENT_LENGTH,
  MAX_NOTE_TITLE_LENGTH,
  prepareAppNotes,
  searchCourseNotes,
  updateCourseNote,
} from "../src/note-model.js";

test("empty courses can be prepared with no resources or notes", () => {
  const appData = prepareAppNotes({
    courses: [{
      id: "course-1",
      name: "Biology",
      folder: "",
      links: [],
      apps: [],
      notes: "",
    }],
    notes: [],
  });

  assert.deepEqual(appData.notes, []);
  assert.equal(appData.courses[0].notes, "");
});

test("legacy course notes migrate into a titled note without losing text", () => {
  const appData = prepareAppNotes({
    courses: [{
      id: "course-1",
      notes: "Remember cell structure",
      createdAt: "2026-01-01T00:00:00.000Z",
    }],
    notes: [],
  });

  assert.equal(appData.notes.length, 1);
  assert.equal(appData.notes[0].title, "Untitled note");
  assert.equal(appData.notes[0].content, "Remember cell structure");
  assert.equal(appData.courses[0].notes, "");

  const whitespaceNotes = prepareAppNotes({
    courses: [{ id: "course-2", notes: "  \n" }],
    notes: [],
  });
  assert.equal(whitespaceNotes.notes[0].content, "  \n");
});

test("notes can be created, updated, and searched by title or body", () => {
  const note = createCourseNote("course-1", " Lecture 1 ", "note-1", "2026-01-01");
  const updated = updateCourseNote(
    note,
    { title: "Cell structure", content: "Mitochondria produce energy." },
    "2026-01-02",
  );

  assert.equal(updated.title, "Cell structure");
  assert.equal(updated.updatedAt, "2026-01-02");
  assert.deepEqual(searchCourseNotes([updated], "MITO"), [updated]);
  assert.deepEqual(searchCourseNotes([updated], "structure"), [updated]);
  assert.deepEqual(searchCourseNotes([updated], "missing"), []);
  assert.equal(createCourseNote("", "A note"), null);
  assert.equal(createCourseNote("course-1", "x".repeat(MAX_NOTE_TITLE_LENGTH + 1)), null);
  assert.throws(
    () => updateCourseNote(note, { content: "x".repeat(MAX_NOTE_CONTENT_LENGTH + 1) }),
    /characters or fewer/,
  );
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { prepareAppNotes } from "../src/note-model.js";
import { rateReview, dueReviews } from "../src/study/study-model.js";
import {
  addReviewQuestion,
  addStudyChapter,
  addStudySource,
  chapterRecallProgress,
  courseReviewItems,
  courseSources,
  createReviewQuestion,
  createStudyChapter,
  createStudySource,
  prepareStudyData,
  removeStudyChapter,
  removeStudySource,
  recordChapterRecall,
  studyCourseData,
} from "../src/study/study-data-model.js";

const v2Fixture = JSON.parse(readFileSync(new URL("./fixtures/desk-drawer-v2.json", import.meta.url), "utf8"));

test("study migration retains V2 course, task, note, session, and settings records", () => {
  const data = structuredClone(v2Fixture);
  const coursesBefore = structuredClone(data.courses);
  const tasksBefore = structuredClone(data.tasks);
  const notesBefore = structuredClone(data.notes);
  const sessionsBefore = structuredClone(data.sessions);
  const legacyNote = coursesBefore[0].notes;

  prepareAppNotes(data);
  prepareStudyData(data);

  const expectedCourse = coursesBefore[0];
  expectedCourse.notes = "";
  assert.deepEqual(data.courses, [expectedCourse]);
  assert.equal(data.notes.find((note) => note.content === legacyNote)?.content, legacyNote);
  assert.deepEqual(data.notes.find((note) => note.id === notesBefore[0].id), notesBefore[0]);
  assert.deepEqual(data.tasks, tasksBefore);
  assert.deepEqual(data.sessions, sessionsBefore);
  assert.deepEqual(data.settings, v2Fixture.settings);
  assert.deepEqual(data.study.courses, {});
});

test("study migration retains legacy study fields and malformed course data without dropping it", () => {
  const legacy = { study: { units: [{ id: "old-unit" }], reviewItems: [{ id: "old-review" }] } };
  prepareStudyData(legacy);
  assert.deepEqual(legacy.study.units, [{ id: "old-unit" }]);
  assert.deepEqual(legacy.study.reviewItems, [{ id: "old-review" }]);
  assert.deepEqual(legacy.study.courses, {});

  const malformed = { study: { courses: ["legacy-course-list"], oldField: 17 } };
  prepareStudyData(malformed);
  assert.deepEqual(malformed.study.legacyData.courses, ["legacy-course-list"]);
  assert.equal(malformed.study.legacyData.oldField, 17);
  assert.deepEqual(malformed.study.courses, {});
});

test("source creation validates protocol, credentials, and absolute Windows paths", () => {
  assert.equal(createStudySource({
    id: "link", title: "Course portal", kind: "link", target: "https://example.edu/course",
  }).target, "https://example.edu/course");
  assert.throws(() => createStudySource({
    id: "bad-protocol", title: "Bad", kind: "link", target: "javascript:alert(1)",
  }), /http:\/\/ or https:\/\//);
  assert.throws(() => createStudySource({
    id: "credentials", title: "Bad", kind: "link", target: "https://name:secret@example.edu/",
  }), /embedded credentials/);
  assert.throws(() => createStudySource({
    id: "relative", title: "Bad", kind: "file", target: "lecture.pdf",
  }), /absolute Windows/);
  assert.equal(createStudySource({
    id: "file", title: "Lecture", kind: "file", target: "C:\\Study\\lecture.pdf",
  }).kind, "file");
});

test("sources, chapters, recall progress, and questions stay isolated per course", () => {
  let study = prepareStudyData({ study: null });
  const source = createStudySource({
    id: "source-1", title: "Chapter notes", kind: "link", target: "https://example.edu/notes",
    now: "2025-09-01T10:00:00.000Z",
  });
  study = addStudySource(study, "course-a", source);
  const chapter = createStudyChapter({
    id: "chapter-1", title: "Cell membranes", now: "2025-09-01T10:00:00.000Z",
  });
  study = addStudyChapter(study, "course-a", source.id, chapter);
  assert.equal(courseSources(study, "course-b").length, 0);

  study = recordChapterRecall(study, "course-a", source.id, chapter.id, "red", "2025-09-02T10:00:00.000Z");
  assert.equal(chapterRecallProgress(courseSources(study, "course-a")[0].chapters[0]), false);
  study = recordChapterRecall(study, "course-a", source.id, chapter.id, "yellow", "2025-09-03T10:00:00.000Z");
  assert.equal(chapterRecallProgress(courseSources(study, "course-a")[0].chapters[0]), true);
  assert.deepEqual(
    courseSources(study, "course-a")[0].chapters[0].recallHistory.map((attempt) => attempt.rating),
    ["red", "yellow"],
  );

  const question = createReviewQuestion({
    id: "question-1",
    courseId: "course-a",
    sourceId: source.id,
    chapterId: chapter.id,
    prompt: "Explain the membrane gradient",
    now: "2025-09-03T10:00:00.000Z",
  });
  study = addReviewQuestion(study, "course-a", question);
  assert.equal(courseReviewItems(study, "course-a").length, 1);
  assert.equal(courseReviewItems(study, "course-b").length, 0);
  assert.equal(dueReviews(courseReviewItems(study, "course-a"), "2025-09-03T10:00:00.000Z").length, 1);
});

test("Leitner review questions reschedule by rating and cap against exam dates", () => {
  const question = createReviewQuestion({
    id: "question-2", courseId: "course-a", sourceId: "source-1", chapterId: "chapter-1",
    prompt: "Describe active transport", now: "2025-09-01T12:00:00.000Z",
  });
  const next = rateReview(question, "green", "2025-09-01T12:00:00.000Z", {
    examAt: "2025-09-03T23:59:59.999Z",
  });
  assert.equal(next.box, 2);
  assert.equal(next.dueAt, "2025-09-02T23:59:59.999Z");
  assert.equal(next.history[0].rating, "green");
  assert.equal(dueReviews([next], "2025-09-02T23:59:59.999Z").length, 1);
});

test("weekly goals and exam dates remain course-scoped while unknown metadata is retained", () => {
  const appData = { study: { retained: "value", courses: {
    "course-a": { examDate: "2025-12-01", weeklyGoalMinutes: 90, custom: "kept" },
  } } };
  const study = prepareStudyData(appData);
  assert.deepEqual(studyCourseData(study, "course-a"), {
    examDate: "2025-12-01", weeklyGoalMinutes: 90, custom: "kept",
  });
  assert.equal(studyCourseData(study, "course-b").examDate, undefined);
  assert.equal(study.retained, "value");
});

test("removing a source or chapter only removes its own recall and review records", () => {
  let study = prepareStudyData({ study: null });
  const firstSource = createStudySource({
    id: "source-remove", title: "Remove me", kind: "link", target: "https://example.edu/remove",
  });
  const secondSource = createStudySource({
    id: "source-keep", title: "Keep me", kind: "link", target: "https://example.edu/keep",
  });
  study = addStudySource(study, "course-a", firstSource);
  study = addStudyChapter(study, "course-a", firstSource.id, createStudyChapter({
    id: "chapter-remove", title: "Remove chapter",
  }));
  study = addStudySource(study, "course-a", secondSource);
  study = addStudyChapter(study, "course-a", secondSource.id, createStudyChapter({
    id: "chapter-keep", title: "Keep chapter",
  }));
  const question = createReviewQuestion({
    id: "question-keep", courseId: "course-a", sourceId: secondSource.id,
    chapterId: "chapter-keep", prompt: "Keep this question",
  });
  study = addReviewQuestion(study, "course-a", question);
  const otherCourseQuestion = createReviewQuestion({
    id: "question-other", courseId: "course-b", sourceId: "source-other",
    chapterId: "chapter-other", prompt: "Keep another course question",
  });
  study = {
    ...study,
    courses: {
      ...study.courses,
      "course-b": { reviewItems: [otherCourseQuestion] },
    },
  };

  study = removeStudyChapter(study, "course-a", firstSource.id, "chapter-remove");
  assert.equal(courseSources(study, "course-a")[0].chapters.length, 0);
  assert.equal(courseReviewItems(study, "course-a").length, 1);
  study = removeStudySource(study, "course-a", secondSource.id);
  assert.equal(courseSources(study, "course-a").length, 1);
  assert.equal(courseReviewItems(study, "course-a").length, 0);
  assert.equal(courseReviewItems(study, "course-b")[0].id, "question-other");
});

test("malformed saved sources and questions are never replaced during edits", () => {
  const study = prepareStudyData({ study: { courses: {
    "course-a": { sources: "keep-this", reviewItems: { old: "questions" } },
  } } });
  const source = createStudySource({
    id: "new", title: "New source", kind: "link", target: "https://example.edu/new",
  });
  assert.throws(() => addStudySource(study, "course-a", source), /left unchanged/);
  assert.throws(() => addReviewQuestion(study, "course-a", createReviewQuestion({
    id: "wrong-course", courseId: "course-b", sourceId: "source", chapterId: "chapter",
    prompt: "Do not attach this question to another course",
  })), /belong to this course/);
  assert.equal(study.courses["course-a"].sources, "keep-this");
  assert.deepEqual(study.courses["course-a"].reviewItems, { old: "questions" });
});

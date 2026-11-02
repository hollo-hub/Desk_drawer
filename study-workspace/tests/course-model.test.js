import test from "node:test";
import assert from "node:assert/strict";
import {
  courseLinksText,
  createEmptyCourse,
  daysSinceLastStudy,
  formatMinutes,
  parseCourseLinks,
  removeCourse,
  upsertCourse,
  weeklyMinutes,
} from "../src/course-model.js";
import { launchMessage } from "../src/launch-message.js";
import {
  courseResources,
  createResourceGroup,
  moveResourceToGroup,
  prepareCourseResources,
  removeResourceGroup,
} from "../src/resource-model.js";
import {
  createStudyTask,
  nextTaskForCourse,
  tasksForCourse,
  toggleStudyTask,
} from "../src/task-model.js";

test("the first course starts empty and contains no seeded sample data", () => {
  const course = createEmptyCourse();

  assert.equal(course.name, "");
  assert.equal(course.folder, "");
  assert.deepEqual(course.links, []);
  assert.deepEqual(course.apps, []);
  assert.equal(course.notes, "");
  assert.ok(course.id);
});

test("links round-trip, derive missing titles, and reject unsafe URLs", () => {
  const links = parseCourseLinks("https://example.com/course\nCourse portal | https://school.edu/portal");

  assert.deepEqual(links, [
    { title: "example.com", url: "https://example.com/course" },
    { title: "Course portal", url: "https://school.edu/portal" },
  ]);
  assert.deepEqual(parseCourseLinks(courseLinksText(links)), links);
  assert.throws(() => parseCourseLinks("javascript:alert(1)"), /http:\/\/ or https:\/\//);
  assert.throws(() => parseCourseLinks("https://user:secret@example.com"), /http:\/\/ or https:\/\//);
  assert.throws(() => parseCourseLinks("Not a URL"), /valid web URL/);
});

test("courses can be added, renamed, and deleted without removing the last course", () => {
  let courses = [];
  for (let index = 1; index <= 3; index += 1) {
    courses = upsertCourse(courses, { id: `course-${index}`, name: `Course ${index}` });
  }

  courses = upsertCourse(courses, { ...courses[0], name: "Algorithms" });
  assert.equal(courses.length, 3);
  assert.equal(courses[0].name, "Algorithms");

  courses = removeCourse(courses, "course-2");
  courses = removeCourse(courses, "course-3");
  assert.deepEqual(courses.map((course) => course.id), ["course-1"]);
  assert.throws(() => removeCourse(courses, "course-1"), /At least one course/);
});

test("launch messages report success, missing folders, and invalid links", () => {
  assert.equal(
    launchMessage({ folderOpened: true, linksOpened: 2, appsOpened: 1, failures: [] }),
    "Opened your folder, 2 links, and 1 app. Focus.",
  );
  assert.equal(
    launchMessage({
      folderOpened: false,
      linksOpened: 1,
      appsOpened: 0,
      failures: [{ kind: "folderMissing", target: "/missing" }],
    }),
    "Couldn't find /missing. Check the folder in Edit.",
  );
  assert.equal(
    launchMessage({
      folderOpened: false,
      linksOpened: 0,
      appsOpened: 0,
      failures: [{ kind: "linkInvalid", target: "javascript:alert(1)" }],
    }),
    "javascript:alert(1) isn't a web link. Links must start with http:// or https://.",
  );
  assert.match(
    launchMessage({
      folderOpened: false,
      linksOpened: 0,
      appsOpened: 0,
      failures: [
        { kind: "appMissing", target: "/missing/app" },
        { kind: "folderMissing", target: "/missing/folder" },
      ],
    }),
    /1 more item\(s\) could not be opened/,
  );
});

test("weekly totals use local Monday as the week boundary", () => {
  const course = { id: "course-1" };
  const sessions = [
    { courseId: "course-1", startedAt: new Date(2026, 0, 5, 0).toISOString(), actualSec: 3600 },
    { courseId: "course-1", startedAt: new Date(2026, 0, 4, 23, 59).toISOString(), actualSec: 3000 },
    { courseId: "course-2", startedAt: new Date(2026, 0, 6, 10).toISOString(), actualSec: 6000 },
  ];

  assert.equal(weeklyMinutes(course, sessions, new Date(2026, 0, 7, 12)), 60);
  assert.equal(formatMinutes(380), "6h 20m this week");
});

test("untouched courses show full local calendar days since their last study", () => {
  const course = { id: "course-1", createdAt: "2026-01-01T23:30:00" };

  assert.equal(daysSinceLastStudy(course, [], new Date(2026, 0, 6, 8)), 5);
  assert.equal(
    daysSinceLastStudy(
      course,
      [{ courseId: "course-1", startedAt: "2026-01-04T12:00:00" }],
      new Date(2026, 0, 6, 8),
    ),
    2,
  );
});

test("course tasks can be added, scoped, and completed", () => {
  const first = createStudyTask("course-1", "  Read chapter 2  ", "task-1", "2026-01-01");
  const next = createStudyTask("course-1", "Write a summary", "task-3", "2026-01-03");
  const other = createStudyTask("course-2", "Watch the lecture", "task-2", "2026-01-02");
  const tasks = [first, other];

  assert.equal(first.title, "Read chapter 2");
  assert.deepEqual(tasksForCourse(tasks, "course-1"), [first]);
  assert.equal(nextTaskForCourse(tasks, "course-1"), first);
  assert.equal(nextTaskForCourse([{ ...first, completed: true }, next], "course-1"), next);
  assert.equal(nextTaskForCourse([first, { ...other, completed: true }], "course-2"), null);
  assert.equal(createStudyTask("course-1", "  "), null);
  assert.equal(createStudyTask("course-1", "x".repeat(161)), null);
  assert.equal(toggleStudyTask(tasks, "task-1")[0].completed, true);
  assert.equal(tasks[0].completed, false);
});

test("legacy course resources appear in a default group without changing their paths", () => {
  const course = prepareCourseResources({
    id: "course-1",
    folder: "/study/biology",
    additionalFolders: ["/study/labs"],
    links: [{ title: "Portal", url: "https://school.example/biology" }],
    apps: ["/study/lecture.mp4"],
    resourceAssignments: [],
  });
  const resources = courseResources(course);

  assert.equal(course.resourceGroups[0].name, "Unsorted");
  assert.deepEqual(resources.map(({ kind, target }) => [kind, target]), [
    ["folder", "/study/biology"],
    ["folder", "/study/labs"],
    ["link", "https://school.example/biology"],
    ["file", "/study/lecture.mp4"],
  ]);
  assert.ok(resources.every((resource) => resource.groupId === course.resourceGroups[0].id));
});

test("resources move between groups and removed groups fall back safely", () => {
  const course = prepareCourseResources({
    id: "course-2",
    folder: "",
    links: [],
    apps: ["/study/notes.pdf"],
    resourceAssignments: [],
  });
  const [resource] = courseResources(course);
  const group = createResourceGroup("Readings", "group-readings");
  const assignments = moveResourceToGroup([], resource, group.id);
  assert.equal(courseResources({ ...course, resourceGroups: [...course.resourceGroups, group], resourceAssignments: assignments })[0].groupId, group.id);

  const result = removeResourceGroup(
    [...course.resourceGroups, group],
    assignments,
    group.id,
  );
  assert.equal(result.assignments[0].groupId, course.resourceGroups[0].id);
  assert.equal(removeResourceGroup(course.resourceGroups, [], course.resourceGroups[0].id), null);
  assert.equal(createResourceGroup(""), null);
  assert.equal(createResourceGroup("x".repeat(61)), null);
});

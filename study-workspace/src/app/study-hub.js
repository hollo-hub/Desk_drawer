import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { appState } from "./state.js";
import { findCourse, selectWorkspaceCourse, setActivePage } from "./workspace.js";
import { localDateInputToEnd } from "../date-model.js";
import { weeklyMinutes, formatMinutes } from "../course-model.js";
import { dueReviews, groupTasksByDue, nextInterleavedCourse, rateReview } from "../study/study-model.js";
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
  updateReviewQuestion,
} from "../study/study-data-model.js";
import { persistNow, scheduleSave, setSaveStatus } from "./persistence.js";

const byId = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);
const timestamp = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date)
    : "";
};
const id = () => crypto.randomUUID();

const skinPicker = byId("study-skin");
const sourceForm = byId("study-source-form");
const sourceKind = byId("study-source-kind");
const sourceTarget = byId("study-source-target");
const sourceTitle = byId("study-source-title");
const sourceBrowse = byId("study-source-browse");
const sourceMessage = byId("study-source-message");
const recallDialog = byId("recall-dialog");
const paletteDialog = byId("command-palette");
let recallTimer = null;

function selectedStudyCourse() {
  return findCourse(appState.selectedCourseId) ?? null;
}

function setStudyMessage(message, isError = false) {
  sourceMessage.textContent = message;
  sourceMessage.dataset.state = isError ? "error" : "";
}

function setRecallMessage(message, isError = false) {
  const element = byId("recall-message");
  element.textContent = message;
  element.dataset.state = isError ? "error" : "";
}

export function initializeStudyHub() {
  const savedSkin = localStorage.getItem("dd-study-skin");
  let legacySkin = null;
  if (!savedSkin) {
    try {
      legacySkin = JSON.parse(localStorage.getItem("dd-skin") ?? "null")?.skin;
    } catch {
      legacySkin = null;
    }
  }
  const preference = savedSkin ?? legacySkin;
  const skin = ["classic", "arc", "mono", "paper"].includes(preference) ? preference : "arc";
  skinPicker.value = skin;
  document.body.dataset.studySkin = skin;
  sourceKind.dispatchEvent(new Event("change"));

  skinPicker.addEventListener("change", () => {
    document.body.dataset.studySkin = skinPicker.value;
    localStorage.setItem("dd-study-skin", skinPicker.value);
  });

  sourceKind.addEventListener("change", () => {
    const browse = sourceKind.value !== "link";
    sourceTarget.type = "text";
    sourceTarget.placeholder = sourceKind.value === "link" ? "https://…" : "Choose a saved file or folder";
    sourceTarget.readOnly = browse;
    sourceBrowse.hidden = !browse;
  });

  sourceBrowse.addEventListener("click", async () => {
    try {
      const target = await open({
        directory: sourceKind.value === "folder",
        multiple: false,
        title: sourceKind.value === "folder" ? "Choose study source folder" : "Choose study source file",
      });
      if (target) sourceTarget.value = target;
    } catch (error) {
      console.error("Could not choose a study source location.", error);
      setStudyMessage(`Could not choose a source: ${String(error)}`, true);
    }
  });

  sourceForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const course = selectedStudyCourse();
    if (!course) return;
    try {
      const source = createStudySource({
        id: id(),
        title: sourceTitle.value,
        kind: sourceKind.value,
        target: sourceTarget.value,
      });
      const study = prepareStudyData(appState.appData);
      appState.appData.study = addStudySource(study, course.id, source);
      sourceForm.reset();
      sourceKind.dispatchEvent(new Event("change"));
      setStudyMessage("Source saved to this course.");
      renderStudyHub();
      scheduleSave();
    } catch (error) {
      setStudyMessage(String(error), true);
      sourceTitle.focus();
    }
  });

  byId("study-source-list").addEventListener("submit", (event) => {
    const form = event.target.closest("[data-chapter-source]");
    if (!form) return;
    event.preventDefault();
    const course = selectedStudyCourse();
    if (!course) return;
    const input = form.querySelector("[name=chapter-title]");
    const target = form.querySelector("[name=chapter-target]");
    try {
      const chapter = createStudyChapter({ id: id(), title: input.value, target: target.value });
      const study = prepareStudyData(appState.appData);
      appState.appData.study = addStudyChapter(study, course.id, form.dataset.chapterSource, chapter);
      renderStudyHub();
      scheduleSave();
      setSaveStatus("Chapter saved.");
    } catch (error) {
      setSaveStatus(String(error), "error");
      input.focus();
    }
  });

  byId("study-source-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-study-action]");
    if (!button) return;
    if (button.dataset.studyAction === "source-open") {
      void openSavedSource(button.dataset.sourceId);
    } else if (button.dataset.studyAction === "source-remove") {
      removeSavedSource(button.dataset.sourceId);
    } else if (button.dataset.studyAction === "chapter-remove") {
      removeSavedChapter(button.dataset.sourceId, button.dataset.chapterId);
    } else if (button.dataset.studyAction === "chapter-recall") {
      beginChapterRecall(button.dataset.sourceId, button.dataset.chapterId);
    }
  });

  byId("study-course-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-study-course]");
    if (button) selectWorkspaceCourse(button.dataset.studyCourse);
  });

  for (const [fieldId, key] of [["study-exam-input", "examDate"], ["study-goal-input", "weeklyGoalMinutes"]]) {
    byId(fieldId).addEventListener("change", () => {
      const course = selectedStudyCourse();
      if (!course) return;
      const input = byId(fieldId);
      if (key === "examDate" && input.value && !localDateInputToEnd(input.value)) {
        setSaveStatus("Enter a valid exam date.", "error");
        input.focus();
        return;
      }
      const study = prepareStudyData(appState.appData);
      const data = studyCourseData(study, course.id);
      const next = { ...data };
      if (key === "examDate") {
        if (input.value) next.examDate = input.value;
        else delete next.examDate;
      } else {
        const minutes = input.value === "" ? null : Number(input.value);
        if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 1680)) {
          setSaveStatus("A weekly goal must be between 1 and 1,680 minutes.", "error");
          input.focus();
          return;
        }
        if (minutes === null) delete next.weeklyGoalMinutes;
        else next.weeklyGoalMinutes = minutes;
      }
      appState.appData.study = {
        ...study,
        courses: { ...study.courses, [course.id]: next },
      };
      renderStudyHub();
      scheduleSave();
    });
  }

  byId("study-task-list").addEventListener("click", (event) => {
    const checkbox = event.target.closest("[data-study-task-toggle]");
    if (!checkbox) return;
    const task = appState.appData.tasks.find((item) => item.id === checkbox.dataset.studyTaskToggle);
    if (!task) return;
    task.completed = checkbox.checked;
    renderStudyHub();
    scheduleSave();
  });

  byId("study-review-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-review-id]");
    if (button) startQuestionRecall(button.dataset.reviewId);
  });

  document.querySelectorAll("[data-study-action]").forEach((button) => {
    button.addEventListener("click", () => runStudyAction(button.dataset.studyAction));
  });
  byId("study-add-course").addEventListener("click", () => byId("add-course").click());
  byId("open-command-palette").addEventListener("click", openPalette);
  byId("close-command-palette").addEventListener("click", () => paletteDialog.close());
  paletteDialog.addEventListener("click", (event) => {
    if (event.target === paletteDialog) paletteDialog.close();
  });
  paletteDialog.querySelector(".command-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-command]");
    if (!button) return;
    paletteDialog.close();
    const commands = { source: "add-source", task: "add-task", recall: "start-recall", hub: "open-hub" };
    runStudyAction(commands[button.dataset.command]);
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
      event.preventDefault();
      if (paletteDialog.open) paletteDialog.close();
      else openPalette();
    }
    if (event.key === "Escape" && recallDialog.open) closeRecall();
  });

  byId("recall-begin").addEventListener("click", () => {
    if (!appState.activeRecall) return;
    appState.activeRecall.startedAt = Date.now();
    byId("recall-read-stage").hidden = true;
    byId("recall-writing-stage").hidden = false;
    const question = appState.activeRecall.questionId
      ? courseReviewItems(appState.appData.study, appState.activeRecall.courseId)
        .find((item) => item.id === appState.activeRecall.questionId)
      : null;
    byId("recall-writing-prompt").textContent = question?.prompt ?? "";
    byId("recall-writing-prompt").hidden = !question;
    byId("recall-answer").value = "";
    byId("recall-answer").focus();
    updateRecallTimer();
    recallTimer = window.setInterval(updateRecallTimer, 1000);
  });
  byId("recall-reveal").addEventListener("click", () => {
    if (!appState.activeRecall) return;
    window.clearInterval(recallTimer);
    recallTimer = null;
    appState.activeRecall.phase = "rating";
    byId("recall-writing-stage").hidden = true;
    byId("recall-rating-stage").hidden = false;
    byId("recall-reveal-prompt").textContent = recallRevealText(appState.activeRecall);
    byId("recall-gap").value = "";
    byId("recall-rating-stage").querySelector("[data-recall-rating=red]").focus();
  });
  byId("recall-open-source").addEventListener("click", () => void openRecallSource());
  byId("recall-compare-source").addEventListener("click", () => void openRecallSource());
  byId("recall-rating-stage").addEventListener("click", (event) => {
    const button = event.target.closest("[data-recall-rating]");
    if (button) finishRecall(button.dataset.recallRating);
  });
  byId("close-recall").addEventListener("click", closeRecall);
  recallDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeRecall();
  });
  recallDialog.addEventListener("click", (event) => {
    if (event.target === recallDialog) closeRecall();
  });
}

function openPalette() {
  if (!paletteDialog.open) paletteDialog.showModal();
  paletteDialog.querySelector("[data-command=source]").focus();
}

export function renderStudyHub() {
  const courses = appState.appData?.courses ?? [];
  const courseList = byId("study-course-list");
  courseList.replaceChildren();
  for (const course of courses) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "study-course-button";
    button.dataset.studyCourse = course.id;
    button.setAttribute("aria-pressed", String(course.id === appState.selectedCourseId));
    button.textContent = course.name;
    courseList.append(button);
  }

  const course = selectedStudyCourse();
  byId("study-empty-state").hidden = Boolean(course);
  byId("study-course-content").hidden = !course;
  if (!course) return;
  byId("study-heading").textContent = course.name;
  const study = prepareStudyData(appState.appData);
  const courseData = studyCourseData(study, course.id);
  byId("study-exam-input").value = typeof courseData.examDate === "string" ? courseData.examDate : "";
  const weeklyGoal = courseData.weeklyGoalMinutes;
  const validWeeklyGoal = Number.isInteger(weeklyGoal) && weeklyGoal >= 1 && weeklyGoal <= 1680;
  byId("study-goal-input").value = weeklyGoal == null ? "" : String(weeklyGoal);
  const examAt = courseData.examDate ? localDateInputToEnd(courseData.examDate) : null;
  const now = new Date();
  const rawQuestions = courseData.reviewItems;
  const allQuestions = courseReviewItems(study, course.id)
    .filter((item) => isValidReviewQuestion(item, course.id));
  const invalidRecords = [
    courseData.examDate != null && !examAt,
    weeklyGoal != null && !validWeeklyGoal,
    rawQuestions != null && !Array.isArray(rawQuestions),
    Array.isArray(rawQuestions) && allQuestions.length !== rawQuestions.length,
  ];
  const rawSources = courseData.sources;
  if (rawSources != null && !Array.isArray(rawSources)) invalidRecords.push(true);
  if (Array.isArray(rawSources)) {
    invalidRecords.push(...rawSources.map((source) =>
      !source || typeof source.id !== "string" || typeof source.title !== "string" ||
      !["link", "file", "folder"].includes(source.kind) || typeof source.target !== "string" ||
      (source.chapters != null && !Array.isArray(source.chapters)) ||
      (Array.isArray(source.chapters) && source.chapters.some((chapter) =>
        !chapter || typeof chapter.id !== "string" || typeof chapter.title !== "string" ||
        (chapter.recallHistory != null && !Array.isArray(chapter.recallHistory)),
      )),
    ));
  }
  const warning = byId("study-data-warning");
  warning.hidden = !invalidRecords.some(Boolean);
  warning.textContent = warning.hidden
    ? ""
    : "Some saved study records are invalid. They have been left unchanged; check the backup before editing them.";
  const due = dueReviews(allQuestions, now);
  const globalDueReviews = listInterleavedDueReviews(now);
  const interleaveButton = byId("study-interleave-review");
  interleaveButton.hidden = !globalDueReviews.length;
  interleaveButton.textContent = `Interleave review · ${globalDueReviews.length} due`;
  const dueTasks = (appState.appData.tasks ?? []).filter((task) => task.courseId === course.id && !task.completed);
  const groups = groupTasksByDue(dueTasks, now);
  const dueTodayCount = groups.overdue.length + groups.today.length;
  byId("study-review-count").textContent = String(due.length);
  byId("study-review-detail").textContent = due.length === 1 ? "Question ready to recall" : "Questions ready to recall";
  byId("study-task-count").textContent = String(dueTasks.length);
  byId("study-task-detail").textContent = dueTodayCount
    ? `${dueTodayCount} due or overdue · ${dueTasks.length - dueTodayCount} later or undated`
    : dueTasks.length
      ? `No tasks due today · ${dueTasks.length} open`
      : "No open tasks";
  byId("study-exam-date").textContent = !courseData.examDate
    ? "Not set"
    : examAt ? timestamp(examAt) : "Check date";
  byId("study-exam-detail").textContent = !courseData.examDate
    ? "Add a date to plan reviews"
    : examAt
      ? `${Math.max(0, Math.ceil((new Date(examAt).getTime() - now.getTime()) / 86400000))} days away`
      : "Choose a valid local date";

  const reviewList = byId("study-review-list");
  reviewList.replaceChildren();
  for (const item of due) {
    const row = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.reviewId = item.id;
    button.textContent = item.prompt;
    const date = document.createElement("small");
    date.textContent = `Box ${item.box ?? 1} · due ${timestamp(item.dueAt)}`;
    row.append(button, date);
    reviewList.append(row);
  }
  const tasks = byId("study-task-list");
  tasks.replaceChildren();
  const displayTasks = [
    ...groups.overdue.map((task) => ({ task, label: "Overdue" })),
    ...groups.today.map((task) => ({ task, label: "Today" })),
    ...groups.thisWeek.map((task) => ({ task, label: "This week" })),
  ].slice(0, 5);
  for (const { task, label } of displayTasks) {
    const row = document.createElement("li");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(task.completed);
    checkbox.dataset.studyTaskToggle = task.id;
    checkbox.setAttribute("aria-label", `Complete ${task.title}`);
    const text = document.createElement("span");
    text.textContent = task.title;
    const dueLabel = document.createElement("small");
    dueLabel.textContent = task.dueAt ? `${label} · ${timestamp(task.dueAt)}` : label;
    row.append(checkbox, text, dueLabel);
    tasks.append(row);
  }
  if (!displayTasks.length) {
    const empty = document.createElement("li");
    empty.textContent = "No open tasks.";
    tasks.append(empty);
  }

  const minutes = weeklyMinutes(course, appState.appData.sessions ?? []);
  byId("study-weekly-time").textContent = validWeeklyGoal
    ? `${formatMinutes(minutes)} / ${formatMinutes(weeklyGoal)} this week's goal`
    : weeklyGoal == null
      ? `${formatMinutes(minutes)} studied this week · no weekly goal`
      : "Saved weekly goal is invalid; enter a new goal.";

  const notes = (appState.appData.notes ?? []).filter((note) => note.courseId === course.id);
  const legacyNotes = course.notes?.trim() ? [course.notes.trim()] : [];
  byId("study-note-summary").textContent = notes.length
    ? `${notes.length} saved note${notes.length === 1 ? "" : "s"} in this course.`
    : legacyNotes.length ? "Your existing course notes are preserved." : "No notes yet.";

  renderStudySources(course, study);
}

function renderStudySources(course, study) {
  const container = byId("study-source-list");
  container.replaceChildren();
  let total = 0;
  let complete = 0;
  for (const source of courseSources(study, course.id)) {
    if (typeof source.id !== "string" || typeof source.title !== "string") continue;
    const chapters = Array.isArray(source.chapters) ? source.chapters : [];
    for (const chapter of chapters) {
      if (!chapter || typeof chapter.id !== "string" || typeof chapter.title !== "string") continue;
      total += 1;
      if (chapterRecallProgress(chapter)) complete += 1;
    }
    const article = document.createElement("article");
    article.className = "study-source-card";
    const heading = document.createElement("div");
    heading.className = "study-source-heading";
    const title = document.createElement("h3");
    title.textContent = source.title;
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "text-action";
    openButton.dataset.studyAction = "source-open";
    openButton.dataset.sourceId = source.id;
    openButton.textContent = `Open ${source.kind === "link" ? "link" : "source"}`;
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "text-action";
    removeButton.dataset.studyAction = "source-remove";
    removeButton.dataset.sourceId = source.id;
    removeButton.textContent = "Remove";
    removeButton.setAttribute("aria-label", `Remove ${source.title}`);
    heading.append(title, openButton, removeButton);
    article.append(heading);
    const list = document.createElement("ul");
    list.className = "study-chapter-list";
    for (const chapter of chapters) {
      if (!chapter || typeof chapter.id !== "string" || typeof chapter.title !== "string") continue;
      const row = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = chapter.title;
      const status = document.createElement("small");
      const successful = chapterRecallProgress(chapter);
      status.textContent = successful ? "Recalled" : "Not recalled yet";
      status.className = successful ? "study-recalled" : "";
      const recall = document.createElement("button");
      recall.type = "button";
      recall.className = "text-action";
      recall.dataset.studyAction = "chapter-recall";
      recall.dataset.sourceId = source.id;
      recall.dataset.chapterId = chapter.id;
      recall.textContent = "Recall";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "text-action";
      remove.dataset.studyAction = "chapter-remove";
      remove.dataset.sourceId = source.id;
      remove.dataset.chapterId = chapter.id;
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${chapter.title}`);
      row.append(name, status, recall, remove);
      list.append(row);
    }
    if (!chapters.length) {
      const empty = document.createElement("li");
      empty.className = "study-chapter-empty";
      empty.textContent = "Add chapters for focused recall practice.";
      list.append(empty);
    }
    const form = document.createElement("form");
    form.className = "study-chapter-form";
    form.dataset.chapterSource = source.id;
    form.innerHTML = `
      <label class="visually-hidden" for="chapter-title-${escapeHtml(source.id)}">Chapter title for ${escapeHtml(source.title)}</label>
      <input id="chapter-title-${escapeHtml(source.id)}" name="chapter-title" type="text" maxlength="160" required placeholder="Add a chapter or section" />
      <label class="visually-hidden" for="chapter-target-${escapeHtml(source.id)}">Optional chapter web link or file path</label>
      <input id="chapter-target-${escapeHtml(source.id)}" name="chapter-target" type="text" maxlength="4096" placeholder="Optional link or local path" />
      <button class="resource-browse-button" type="submit">Add chapter</button>`;
    article.append(list, form);
    container.append(article);
  }
  byId("study-chapter-progress").textContent = `${complete} of ${total} chapters recalled`;
}

function runStudyAction(action) {
  if (action === "open-hub") {
    setActivePage("study");
  } else if (action === "add-source") {
    setActivePage("study");
    if (selectedStudyCourse()) sourceTitle.focus();
    else byId("study-add-course").focus();
  } else if (action === "add-task") {
    if (selectedStudyCourse()) {
      setActivePage("tasks");
      byId("new-task-title").focus();
    } else {
      byId("add-course").click();
    }
  } else if (action === "open-tasks") {
    setActivePage("tasks");
  } else if (action === "open-notes") {
    setActivePage("notes");
  } else if (action === "start-session") {
    setActivePage("desk");
    byId("start-session").click();
  } else if (action === "interleave-review") {
    const next = listInterleavedDueReviews(new Date())[0];
    if (!next) return;
    selectWorkspaceCourse(next.courseId);
    startQuestionRecall(next.item.id);
  } else if (action === "start-recall") {
    if (!selectedStudyCourse()) {
      setActivePage("study");
      byId("study-add-course").focus();
      return;
    }
    const firstSource = courseSources(appState.appData?.study, appState.selectedCourseId)
      .find((source) => Array.isArray(source?.chapters) && source.chapters.length > 0);
    const first = firstSource?.chapters[0];
    if (first) beginChapterRecall(
      firstSource.id,
      first.id,
    );
    else {
      setActivePage("study");
      setStudyMessage("Add a source and chapter before starting a recall session.", true);
      sourceTitle.focus();
    }
  }
}

function listInterleavedDueReviews(now) {
  const courses = appState.appData?.courses ?? [];
  const dueByCourse = new Map(courses.map((course) => [
    course.id,
    dueReviews(
      courseReviewItems(appState.appData.study, course.id)
        .filter((item) => isValidReviewQuestion(item, course.id)),
      now,
    ),
  ]));
  const dueCourseIds = courses.filter((course) => dueByCourse.get(course.id)?.length)
    .map((course) => course.id);
  if (!dueCourseIds.length) return [];
  const nextCourseId = nextInterleavedCourse(appState.appData.sessions ?? [], dueCourseIds);
  return dueByCourse.get(nextCourseId).map((item) => ({ courseId: nextCourseId, item }));
}

function isValidReviewQuestion(item, courseId) {
  return item && typeof item.id === "string" &&
    typeof item.prompt === "string" &&
    item.courseId === courseId &&
    typeof item.sourceId === "string" &&
    typeof (item.chapterId ?? item.unitId) === "string" &&
    Number.isInteger(item.box) && item.box >= 1 &&
    Number.isFinite(new Date(item.dueAt).getTime()) &&
    Array.isArray(item.history);
}

function findSourceChapter(courseId, sourceId, chapterId) {
  const source = courseSources(appState.appData?.study, courseId).find((item) => item.id === sourceId);
  const chapter = (Array.isArray(source?.chapters) ? source.chapters : [])
    .find((item) => item?.id === chapterId);
  if (!source || !chapter) throw new Error("The saved source or chapter could not be found.");
  return { source, chapter };
}

function beginChapterRecall(sourceId, chapterId) {
  const course = selectedStudyCourse();
  if (!course) return;
  try {
    const { source, chapter } = findSourceChapter(course.id, sourceId, chapterId);
    appState.activeRecall = { courseId: course.id, sourceId, chapterId, questionId: null, phase: "read" };
    showRecallDialog(source, chapter, null);
  } catch (error) {
    setSaveStatus(String(error), "error");
  }
}

function startQuestionRecall(questionId) {
  const course = selectedStudyCourse();
  if (!course) return;
  const question = courseReviewItems(appState.appData?.study, course.id).find((item) => item.id === questionId);
  if (!question) {
    setSaveStatus("The saved review question could not be found.", "error");
    return;
  }
  try {
    const { source, chapter } = findSourceChapter(course.id, question.sourceId, question.chapterId ?? question.unitId);
    appState.activeRecall = {
      courseId: course.id, sourceId: source.id, chapterId: chapter.id, questionId, phase: "read",
    };
    showRecallDialog(source, chapter, question);
  } catch (error) {
    setSaveStatus(String(error), "error");
  }
}

function showRecallDialog(source, chapter, question) {
  byId("recall-heading").textContent = question ? "Recall a review question" : "Recall a chapter";
  byId("recall-read-prompt").textContent = question ? question.prompt : chapter.title;
  byId("recall-read-location").textContent = question
    ? `From ${source.title} · ${chapter.title}`
    : `${source.title} · ${chapter.title}`;
  byId("recall-rating-stage").hidden = true;
  byId("recall-writing-stage").hidden = true;
  byId("recall-read-stage").hidden = false;
  setRecallMessage("");
  recallDialog.showModal();
  byId("recall-open-source").focus();
}

function recallRevealText(recall) {
  const { source, chapter } = findSourceChapter(recall.courseId, recall.sourceId, recall.chapterId);
  const question = recall.questionId
    ? courseReviewItems(appState.appData.study, recall.courseId).find((item) => item.id === recall.questionId)
    : null;
  return question
    ? `Compare your answer to the saved source: ${source.title} · ${chapter.title}`
    : `Compare what you wrote with ${source.title} · ${chapter.title}`;
}

async function openSavedSource(sourceId, chapterId = null) {
  const course = selectedStudyCourse();
  if (!course) return;
  try {
    if (!(await persistNow())) throw new Error("Save the study source before opening it.");
    await invoke("open_study_source", { courseId: course.id, sourceId, chapterId });
  } catch (error) {
    console.error("Could not open the saved study source.", error);
    setSaveStatus(`Could not open saved source: ${String(error)}`, "error");
  }
}

async function openRecallSource() {
  const recall = appState.activeRecall;
  if (recall) await openSavedSource(recall.sourceId, recall.chapterId);
}

function removeSavedSource(sourceId) {
  const course = selectedStudyCourse();
  const source = courseSources(appState.appData?.study, course?.id).find((item) => item.id === sourceId);
  if (!course || !source || !window.confirm(`Remove "${source.title}" and its chapters, recall history, and review questions?`)) return;
  try {
    appState.appData.study = removeStudySource(appState.appData.study, course.id, sourceId);
    renderStudyHub();
    scheduleSave();
  } catch (error) {
    setSaveStatus(String(error), "error");
  }
}

function removeSavedChapter(sourceId, chapterId) {
  const course = selectedStudyCourse();
  if (!course) return;
  try {
    const { chapter } = findSourceChapter(course.id, sourceId, chapterId);
    if (!window.confirm(`Remove "${chapter.title}", its recall history, and its review questions?`)) return;
    appState.appData.study = removeStudyChapter(appState.appData.study, course.id, sourceId, chapterId);
    renderStudyHub();
    scheduleSave();
  } catch (error) {
    setSaveStatus(String(error), "error");
  }
}

function updateRecallTimer() {
  if (!appState.activeRecall?.startedAt) return;
  const elapsed = Math.floor((Date.now() - appState.activeRecall.startedAt) / 1000);
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");
  byId("recall-timer").textContent = `${minutes}:${seconds}`;
}

function finishRecall(rating) {
  const recall = appState.activeRecall;
  if (!recall || !["red", "yellow", "green"].includes(rating)) return;
  try {
    const now = new Date();
    const examDate = studyCourseData(appState.appData.study, recall.courseId).examDate;
    let study = recordChapterRecall(
      appState.appData.study, recall.courseId, recall.sourceId, recall.chapterId, rating, now,
    );
    if (recall.questionId) {
      const question = courseReviewItems(study, recall.courseId).find((item) => item.id === recall.questionId);
      if (!question) throw new Error("The review question could not be found.");
      const nextQuestion = rateReview(question, rating, now, {
        examAt: examDate ? localDateInputToEnd(examDate) : null,
      });
      study = updateReviewQuestion(study, recall.courseId, nextQuestion);
    }
    const prompt = byId("recall-gap").value.trim();
    if (prompt) {
      const question = createReviewQuestion({
        id: id(), courseId: recall.courseId, sourceId: recall.sourceId, chapterId: recall.chapterId, prompt, now,
      });
      study = addReviewQuestion(study, recall.courseId, question);
    }
    appState.appData.study = study;
    scheduleSave();
    closeRecall();
    renderStudyHub();
    setSaveStatus(prompt ? "Recall saved and your question is ready for review." : "Recall saved.");
  } catch (error) {
    setRecallMessage(String(error), true);
  }
}

function closeRecall() {
  window.clearInterval(recallTimer);
  recallTimer = null;
  appState.activeRecall = null;
  if (recallDialog.open) recallDialog.close();
  setRecallMessage("");
}

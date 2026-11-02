import { appState } from "./state.js";
import { COURSE_COLORS, daysSinceLastStudy, formatMinutes, weeklyMinutes } from "../course-model.js";
import { invoke } from "@tauri-apps/api/core";
import { normalizeTimerLength } from "../timer-model.js";
import { prepareAppNotes } from "../note-model.js";
import { prepareCourseResources } from "../resource-model.js";
import { appPages, catBubble, courseList, courseTitle, emptyAddCourseButton, guideCard, noteContentInput, noteCreateButton, noteDeleteButton, noteSearchInput, noteTitleInput, notesAddCourseButton, notesCourseSelect, notesEmptyState, notesWorkspace, pageNavButtons, reducedMotionPreference, resourceGroupForm, resourceLibrary, resourceLinkForm, resourcesAddCourseButton, resourcesCourseSelect, resourcesEmptyState, stageHint, taskForm, tasksAddCourseButton, tasksCourseSelect, tasksEmptyState, timerActions, timerDisplay, timerLengths } from "./dom.js";
import { applyAppearance } from "./settings.js";
import { explainSessionLock, updateLengthSelection, updateTimerControls } from "./session.js";
import { initializeBuddy, showCourseNudge, showRandomBuddyLine, updateReducedMotionPreference } from "./buddy.js";
import { openGuide, refreshGuideSteps } from "./guide.js";
import { renderHistory } from "./history.js";
import { renderNotesWorkspace } from "./notes.js";
import { renderResourceGroups, renderResourceList } from "./resources.js";
import { renderStats } from "./stats.js";
import { renderTaskList } from "./tasks.js";
import { scheduleSave, setSaveStatus } from "./persistence.js";
import { setupDownloadFiling, setupTrayActions } from "./downloads.js";

export async function loadCourses() {
  setEditorEnabled(false);
  setSaveStatus("Loading your courses…");

  try {
    appState.appData = await invoke("load_data");
    appState.appData.tasks ??= [];
    appState.appData.settings.downloadFilingEnabled ??= false;
    appState.appData.settings.notifications ??= true;
    appState.appData.settings.soundEffects ??= true;
    appState.appData.settings.dashboardComponents ??= ["character", "course-dock", "next-task"];
    appState.appData.courses.forEach((course) => {
      prepareCourseResources(course);
      course.filingKeywords ??= [];
    });
    const hasLegacyNotes = appState.appData.courses.some((course) => course.notes?.length > 0);
    prepareAppNotes(appState.appData);
    appState.selectedLengthSec = normalizeTimerLength(appState.appData.settings.defaultLengthSec);
    updateLengthSelection();
    appState.selectedCourseId = appState.appData.courses[0]?.id ?? null;
    render();
    setSaveStatus("");
    applyAppearance();
    updateReducedMotionPreference();
    reducedMotionPreference.addEventListener("change", updateReducedMotionPreference);
    setEditorEnabled(true);
    document.querySelector("#notifications-setting").checked = appState.appData.settings.notifications;
    document.querySelector("#download-filing-setting").checked =
      appState.appData.settings.downloadFilingEnabled;
    await setupDownloadFiling();
    await setupTrayActions();
    if (hasLegacyNotes) scheduleSave();
    showCourseNudge();
    initializeBuddy();
    if (appState.currentBuddyState === "idle") showRandomBuddyLine();
    if (!appState.appData.settings.tourDone) {
      window.setTimeout(() => openGuide(), 250);
    }
  } catch (error) {
    console.error("Could not load or initialize local course data.", error);
    setSaveStatus(`Could not load courses: ${String(error)}`, "error");
  }
}

export function setEditorEnabled(enabled) {
  document.querySelector("#add-course").disabled = !enabled;
  document.querySelector("#edit-course").disabled = !enabled;
  const courseReady = enabled && Boolean(appState.appData?.courses.length);
  notesCourseSelect.disabled = !courseReady;
  tasksCourseSelect.disabled = !courseReady;
  resourcesCourseSelect.disabled = !courseReady;
  resourceLibrary.hidden = !courseReady;
  resourceGroupForm.querySelectorAll("input, button").forEach((control) => {
    control.disabled = !courseReady;
  });
  resourceLinkForm.querySelectorAll("input, button").forEach((control) => {
    control.disabled = !courseReady;
  });
  document.querySelector("#resource-add-folder").disabled = !courseReady;
  document.querySelector("#resource-add-files").disabled = !courseReady;
  noteSearchInput.disabled = !courseReady;
  noteCreateButton.disabled = !courseReady;
  noteTitleInput.disabled = !courseReady;
  noteContentInput.disabled = !courseReady;
  noteDeleteButton.disabled = !courseReady;
  document.querySelectorAll("[data-note-format]").forEach((button) => {
    button.disabled = !courseReady;
  });
  taskForm.hidden = !courseReady;
  taskForm.querySelectorAll("input, button").forEach((control) => {
    control.disabled = !courseReady;
  });
  updateTimerControls();
}

export function findCourse(id) {
  return appState.appData?.courses.find((course) => course.id === id);
}

export function render() {
  renderCourses();
  renderSelectedCourse();
}

export function renderCourses() {
  courseList.replaceChildren();
  if (!appState.appData) return;
  if (appState.appData.courses.length === 0) return;

  const minutes = appState.appData.courses.map((course) => weeklyMinutes(course, appState.appData.sessions));
  const largestTotal = Math.max(0, ...minutes);

  appState.appData.courses.forEach((course, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "course-card";
    button.setAttribute("aria-pressed", String(course.id === appState.selectedCourseId));
    button.setAttribute("aria-label", `${course.name}, ${formatMinutes(minutes[index])}`);
    button.style.setProperty("--course-color", course.color);
    button.addEventListener("click", () => {
      if (appState.activeSession || appState.launchInProgress) {
        explainSessionLock();
        return;
      }
      appState.selectedCourseId = course.id;
      render();
      if (appState.currentBuddyState === "idle") showRandomBuddyLine();
    });

    const nameRow = document.createElement("span");
    nameRow.className = "course-name-row";
    const dot = document.createElement("span");
    dot.className = "course-dot";
    dot.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.className = "course-name";
    name.textContent = course.name;
    nameRow.append(dot, name);

    const days = daysSinceLastStudy(course, appState.appData.sessions);
    if (days !== null && days >= 4) {
      const tag = document.createElement("span");
      tag.className = "days-tag";
      tag.textContent = `${days} days`;
      nameRow.append(tag);
    }

    const week = document.createElement("span");
    week.className = "course-week";
    week.textContent = formatMinutes(minutes[index]);
    const bar = document.createElement("span");
    bar.className = "course-bar";
    bar.setAttribute("aria-hidden", "true");
    const barValue = document.createElement("span");
    barValue.style.width = largestTotal > 0 ? `${(minutes[index] / largestTotal) * 100}%` : "0%";
    bar.append(barValue);

    button.append(nameRow, week, bar);
    courseList.append(button);
  });
}

export function renderSelectedCourse() {
  const course = findCourse(appState.selectedCourseId);
  const hasCourses = Boolean(appState.appData?.courses.length);
  courseTitle.textContent = course?.name || (appState.appData ? "Your study desk is empty" : "Loading your courses…");
  stageHint.textContent = course
    ? "Choose a focus length and start when you’re ready."
    : hasCourses
      ? "Choose a course below, or add another to your study desk."
      : appState.appData
        ? "Create a course to start building your study space."
        : "Choose a course below, or edit one to set up its folder and links.";
  emptyAddCourseButton.hidden = !appState.appData || hasCourses;
  emptyAddCourseButton.textContent = "Create your first course";
  catBubble.hidden = !course;
  document.querySelector(".stage").dataset.empty = String(Boolean(appState.appData && !hasCourses));
  document.querySelector(".course-dock").dataset.empty = String(Boolean(appState.appData && !hasCourses));
  timerDisplay.hidden = Boolean(appState.appData && !hasCourses);
  timerLengths.hidden = Boolean(appState.appData && !hasCourses);
  timerActions.hidden = Boolean(appState.appData && !hasCourses);
  document.querySelector("#edit-course").hidden = !hasCourses;
  document
    .querySelector(".stage")
    .style.setProperty("--course-color", course?.color ?? COURSE_COLORS[0].value);
  renderWorkspacePages();
  updateReducedMotionPreference();
  document.querySelector("#edit-course").disabled = !course || !appState.appData || appState.appData.courses.length === 0;
  updateTimerControls();
  if (!guideCard.hidden) refreshGuideSteps();
}

export function setActivePage(page) {
  if (!["desk", "resources", "notes", "tasks", "stats", "history"].includes(page)) return;
  appState.activePage = page;
  for (const button of pageNavButtons) {
    if (button.dataset.pageTarget === page) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  }
  for (const element of appPages) {
    element.hidden = element.id !== `${page}-page`;
  }
}

export function selectWorkspaceCourse(courseId) {
  if (!findCourse(courseId)) return;
  if (appState.activeSession || appState.launchInProgress) {
    renderWorkspacePages();
    explainSessionLock();
    return;
  }
  appState.selectedCourseId = courseId;
  render();
}

export function renderWorkspacePages() {
  renderCourseSelect(notesCourseSelect);
  renderCourseSelect(tasksCourseSelect);
  renderCourseSelect(resourcesCourseSelect);
  const course = findCourse(appState.selectedCourseId);

  resourcesEmptyState.hidden = Boolean(course);
  resourcesAddCourseButton.hidden = Boolean(course);
  resourceLibrary.hidden = !course;
  renderResourceGroups(course);
  renderResourceList(course);

  notesEmptyState.hidden = Boolean(course);
  notesAddCourseButton.hidden = Boolean(course);
  notesWorkspace.hidden = !course;
  if (!course || appState.notesWorkspaceCourseId !== course.id) {
    appState.selectedNoteId = null;
    appState.notesWorkspaceCourseId = course?.id ?? null;
  }
  renderNotesWorkspace(course);

  tasksEmptyState.hidden = Boolean(course);
  tasksAddCourseButton.hidden = Boolean(course);
  taskForm.hidden = !course;
  renderTaskList();
  renderHistory();
  renderStats();
}

export function renderCourseSelect(select) {
  const previousValue = select.value;
  select.replaceChildren();
  for (const course of appState.appData?.courses ?? []) {
    const option = document.createElement("option");
    option.value = course.id;
    option.textContent = course.name;
    select.append(option);
  }
  select.disabled = !appState.appData?.courses.length;
  select.value =
    appState.appData?.courses.some((course) => course.id === appState.selectedCourseId)
      ? appState.selectedCourseId
      : appState.appData?.courses.some((course) => course.id === previousValue)
        ? previousValue
        : "";
}

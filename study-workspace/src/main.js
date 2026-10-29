import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import {
  COURSE_COLORS,
  courseLinksText,
  createEmptyCourse,
  daysSinceLastStudy,
  formatMinutes,
  parseCourseLinks,
  removeCourse,
  upsertCourse,
  weeklyMinutes,
} from "./course-model.js";
import {
  createCourseNote,
  prepareAppNotes,
  searchCourseNotes,
  updateCourseNote,
} from "./note-model.js";
import { launchMessage } from "./launch-message.js";
import {
  courseResources,
  createResourceGroup,
  moveResourceToGroup,
  prepareCourseResources,
  removeResourceGroup,
} from "./resource-model.js";
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
} from "./timer-model.js";
import {
  createStudyTask,
  nextTaskForCourse,
  tasksForCourse,
  toggleStudyTask,
} from "./task-model.js";
import { longestStudyStreak, minutesByCourse } from "./stats-model.js";
import { sprite } from "./buddy/ghost-sprite.js";

const courseList = document.querySelector("#course-list");
const pageNavButtons = [...document.querySelectorAll("[data-page-target]")];
const appPages = [...document.querySelectorAll(".app-page")];
const courseTitle = document.querySelector("#course-title");
const catBubble = document.querySelector("#cat-bubble");
const buddyArt = document.querySelector("#buddy-art");
const saveStatus = document.querySelector("#save-status");
const timerDisplay = document.querySelector("#timer-display");
const timerHalo = document.querySelector("#timer-halo");
const timerHaloProgress = document.querySelector("#timer-halo-progress");
const timerLengths = document.querySelector("#timer-lengths");
const timerActions = document.querySelector(".timer-actions");
const stageHint = document.querySelector("#stage-hint");
const nextTaskPreview = document.querySelector("#next-task-preview");
const emptyAddCourseButton = document.querySelector("#empty-add-course");
const notesCourseSelect = document.querySelector("#notes-course-select");
const tasksCourseSelect = document.querySelector("#tasks-course-select");
const resourcesCourseSelect = document.querySelector("#resources-course-select");
const notesEmptyState = document.querySelector("#notes-empty-state");
const notesAddCourseButton = document.querySelector("#notes-add-course");
const notesWorkspace = document.querySelector("#notes-workspace");
const notesSaveHint = document.querySelector("#notes-save-hint");
const noteSearchInput = document.querySelector("#note-search");
const noteCreateButton = document.querySelector("#note-create");
const noteListEmpty = document.querySelector("#note-list-empty");
const noteList = document.querySelector("#note-list");
const noteEditor = document.querySelector("#note-editor");
const noteNoSelection = document.querySelector("#note-no-selection");
const noteTitleInput = document.querySelector("#note-title");
const noteContentInput = document.querySelector("#note-content");
const noteDeleteButton = document.querySelector("#note-delete");
const noteCharacterCount = document.querySelector("#note-character-count");
const tasksEmptyState = document.querySelector("#tasks-empty-state");
const tasksAddCourseButton = document.querySelector("#tasks-add-course");
const taskListEmpty = document.querySelector("#task-list-empty");
const taskForm = document.querySelector("#task-form");
const newTaskTitleInput = document.querySelector("#new-task-title");
const taskList = document.querySelector("#task-list");
const resourcesEmptyState = document.querySelector("#resources-empty-state");
const resourcesAddCourseButton = document.querySelector("#resources-add-course");
const resourceLibrary = document.querySelector("#resource-library");
const resourceGroupForm = document.querySelector("#resource-group-form");
const newResourceGroupInput = document.querySelector("#new-resource-group");
const resourceGroupList = document.querySelector("#resource-group-list");
const resourceListEmpty = document.querySelector("#resource-list-empty");
const resourceList = document.querySelector("#resource-list");
const resourceLinkForm = document.querySelector("#resource-link-form");
const resourceLinkTitleInput = document.querySelector("#resource-link-title");
const resourceLinkUrlInput = document.querySelector("#resource-link-url");
const startSessionButton = document.querySelector("#start-session");
const pauseSessionButton = document.querySelector("#pause-session");
const endSessionButton = document.querySelector("#end-session");
const timerLengthButtons = [...document.querySelectorAll("[data-length-sec]")];
const customMinutesInput = document.querySelector("#custom-minutes");
const applyCustomLengthButton = document.querySelector("#apply-custom-length");
const sheet = document.querySelector("#course-sheet");
const form = document.querySelector("#course-form");
const formMessage = document.querySelector("#form-message");
const deleteButton = document.querySelector("#delete-course");
const deleteHint = document.querySelector("#delete-hint");
const historyEmptyState = document.querySelector("#history-empty-state");
const historyList = document.querySelector("#history-list");
const sessionSummaryDialog = document.querySelector("#session-summary-dialog");
const sessionSummaryForm = document.querySelector("#session-summary-form");
const sessionSummaryInput = document.querySelector("#session-summary-input");
const statsThisWeek = document.querySelector("#stats-this-week");
const statsLastWeek = document.querySelector("#stats-last-week");
const guideScrim = document.querySelector("#guide-scrim");
const guideCard = document.querySelector("#guide-card");
const settingsDialog = document.querySelector("#settings-dialog");
const settingsGearButton = document.querySelector("#open-settings");
const downloadFilingCard = document.querySelector("#download-filing-card");
const downloadFilingSelect = document.querySelector("#download-filing-course");
const downloadUndoCard = document.querySelector("#download-undo-card");
const soundEffectsSetting = document.querySelector("#sound-effects-setting");
const clickSound = new Audio("/sounds/click.ogg");
const confirmSound = new Audio("/sounds/confirmation.ogg");
clickSound.volume = 0.16;
confirmSound.volume = 0.2;
let activeDownloadCandidate = null;
let downloadCandidateQueue = [];
let activeUndoId = null;
let undoExpirationTimer = null;
let quitRequested = false;

let appData = null;
let selectedCourseId = null;
let editing = null;
let saveTimer = null;
let saveRevision = 0;
let writeQueue = Promise.resolve();
let statusTimer = null;
let launchInProgress = false;
let selectedLengthSec = TIMER_PRESETS[0].seconds;
let selectedTimerMode = "stopwatch";
let activeSession = null;
let timerInterval = null;
let lastTimerSecond = null;
let lastWindowTitle = "Desk Drawer Study";
let sessionFinishing = false;
let activePage = "desk";
let selectedNoteId = null;
let notesWorkspaceCourseId = null;
let latestSessionId = null;
let guideStep = 0;
let doneStateTimer = null;
let nudgeShown = false;
let buddyFrame = 0;
let buddyFrameTimer = null;
let buddyBlinkTimer = null;
let buddyBlinkResetTimer = null;
let buddyIdleMessageTimer = null;
let currentBuddyState = "idle";
let idleMessageBag = [];
let lastIdleMessage = "";
const buddyIdleMessages = [
  "Ready when you are.",
  "One small step still counts.",
  "Your study kit is waiting.",
  "Let’s make a little progress.",
  "Take it one page at a time.",
  "You’ve got this.",
  "Curiosity looks good on you.",
  "Every session adds up.",
  "I’m right here when you need me.",
  "A quick start can change the whole day.",
];
let guideSteps = [];
const haloCircumference = 2 * Math.PI * 96;
const reducedMotionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const colorSchemePreference = window.matchMedia("(prefers-color-scheme: dark)");

colorSchemePreference.addEventListener("change", () => {
  if (appData?.settings.theme === "system") applyAppearance();
});

document.querySelector("#add-course").addEventListener("click", () => {
  if (activeSession || launchInProgress) {
    explainSessionLock();
    return;
  }
  openCourseSheet(createEmptyCourse(), true);
});

function addResourceGroup(event) {
  event.preventDefault();
  const course = findCourse(selectedCourseId);
  if (!course) return;
  const group = createResourceGroup(newResourceGroupInput.value);
  if (!group) {
    newResourceGroupInput.focus();
    return;
  }
  if (course.resourceGroups.some((item) => item.name.toLocaleLowerCase() === group.name.toLocaleLowerCase())) {
    setSaveStatus("A resource group with that name already exists.", "error");
    newResourceGroupInput.focus();
    return;
  }
  course.resourceGroups.push(group);
  newResourceGroupInput.value = "";
  renderResourceGroups(course);
  renderResourceList(course);
  scheduleSave();
}

function renderResourceGroups(course) {
  resourceGroupList.replaceChildren();
  if (!course) return;

  const resources = courseResources(course);
  for (const group of course.resourceGroups) {
    const item = document.createElement("li");
    item.className = "resource-group-chip";
    const name = document.createElement("span");
    name.textContent = group.name;
    const count = document.createElement("small");
    count.textContent = String(resources.filter((resource) => resource.groupId === group.id).length);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.removeResourceGroup = group.id;
    remove.disabled = course.resourceGroups.length <= 1 || group.id === course.resourceGroups[0].id;
    remove.setAttribute("aria-label", `Remove ${group.name} group`);
    remove.textContent = "Remove";
    item.append(name, count, remove);
    resourceGroupList.append(item);
  }
}

function renderResourceList(course) {
  resourceList.replaceChildren();
  const resources = courseResources(course);
  resourceListEmpty.hidden = !course || resources.length > 0;
  if (!course) return;

  for (const group of course.resourceGroups) {
    const groupedResources = resources.filter((resource) => resource.groupId === group.id);
    if (groupedResources.length === 0) continue;
    const groupItem = document.createElement("li");
    groupItem.className = "resource-list-group";
    const heading = document.createElement("h2");
    heading.textContent = group.name;
    const items = document.createElement("ul");
    items.className = "resource-group-items";

    for (const resource of groupedResources) {
      const item = document.createElement("li");
      item.className = "resource-library-item";
      const details = document.createElement("span");
      details.className = "resource-library-details";
      const title = document.createElement("strong");
      title.textContent = resource.title;
      const target = document.createElement("small");
      target.textContent = resource.target;
      details.append(title, target);

      const groupSelect = document.createElement("select");
      groupSelect.dataset.resourceGroup = "true";
      groupSelect.dataset.resourceKind = resource.kind;
      groupSelect.dataset.resourceTarget = resource.target;
      groupSelect.setAttribute("aria-label", `Group for ${resource.title}`);
      for (const optionGroup of course.resourceGroups) {
        const option = document.createElement("option");
        option.value = optionGroup.id;
        option.textContent = optionGroup.name;
        groupSelect.append(option);
      }
      groupSelect.value = resource.groupId;

      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.dataset.openResource = "true";
      openButton.dataset.resourceKind = resource.kind;
      openButton.dataset.resourceTarget = resource.target;
      openButton.textContent = "Open";
      openButton.setAttribute("aria-label", `Open ${resource.title}`);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.dataset.removeResource = "true";
      removeButton.dataset.resourceKind = resource.kind;
      removeButton.dataset.resourceTarget = resource.target;
      removeButton.textContent = "Remove";
      removeButton.setAttribute("aria-label", `Remove ${resource.title}`);

      const actions = document.createElement("span");
      actions.className = "resource-library-actions";
      actions.append(groupSelect, openButton, removeButton);
      item.append(details, actions);
      items.append(item);
    }

    groupItem.append(heading, items);
    resourceList.append(groupItem);
  }
}

function removeSelectedResourceGroup(event) {
  const button = event.target.closest("[data-remove-resource-group]");
  const course = findCourse(selectedCourseId);
  if (!button || !course) return;
  const result = removeResourceGroup(
    course.resourceGroups,
    course.resourceAssignments,
    button.dataset.removeResourceGroup,
  );
  if (!result) return;
  course.resourceGroups = result.groups;
  course.resourceAssignments = result.assignments;
  renderResourceGroups(course);
  renderResourceList(course);
  scheduleSave();
}

function moveSelectedResource(event) {
  const select = event.target.closest("[data-resource-group]");
  const course = findCourse(selectedCourseId);
  if (!select || !course) return;
  const resource = {
    kind: select.dataset.resourceKind,
    target: select.dataset.resourceTarget,
  };
  course.resourceAssignments = moveResourceToGroup(
    course.resourceAssignments,
    resource,
    select.value,
  );
  renderResourceGroups(course);
  renderResourceList(course);
  scheduleSave();
}

async function handleResourceAction(event) {
  const button = event.target.closest("[data-open-resource], [data-remove-resource]");
  const course = findCourse(selectedCourseId);
  if (!button || !course) return;
  const kind = button.dataset.resourceKind;
  const target = button.dataset.resourceTarget;

  if (button.hasAttribute("data-open-resource")) {
    try {
      if (!(await persistNow())) {
        setSaveStatus("Save this resource before opening it.", "error");
        return;
      }
      await invoke("open_resource", { courseId: course.id, kind, target });
    } catch (error) {
      console.error("Could not open the selected resource.", error);
      setSaveStatus(`Could not open resource: ${String(error)}`, "error");
    }
    return;
  }

  if (kind === "folder") {
    if (course.folder === target) course.folder = "";
    course.additionalFolders = course.additionalFolders.filter((folder) => folder !== target);
  } else if (kind === "link") {
    course.links = course.links.filter((link) => link.url !== target);
  } else {
    course.apps = course.apps.filter((path) => path !== target);
  }
  course.resourceAssignments = course.resourceAssignments.filter(
    (assignment) => assignment.kind !== kind || assignment.target !== target,
  );
  renderResourceGroups(course);
  renderResourceList(course);
  scheduleSave();
}

async function chooseLibraryFolder() {
  const course = findCourse(selectedCourseId);
  if (!course) return;
  try {
    const folder = await open({
      directory: true,
      multiple: false,
      canCreateDirectories: true,
      title: "Add a course resource folder",
    });
    if (folder === null) return;
    if (folder !== course.folder && !course.additionalFolders.includes(folder)) {
      course.additionalFolders.push(folder);
    }
    renderResourceGroups(course);
    renderResourceList(course);
    scheduleSave();
  } catch (error) {
    console.error("Could not add a resource folder.", error);
    setSaveStatus(`Could not add folder: ${String(error)}`, "error");
  }
}

async function chooseLibraryFiles() {
  const course = findCourse(selectedCourseId);
  if (!course) return;
  try {
    const selected = await open({
      directory: false,
      multiple: true,
      title: "Add course resource files",
    });
    if (selected === null) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    course.apps = [...new Set([...course.apps, ...paths])];
    renderResourceGroups(course);
    renderResourceList(course);
    scheduleSave();
  } catch (error) {
    console.error("Could not add resource files.", error);
    setSaveStatus(`Could not add files: ${String(error)}`, "error");
  }
}

function addCourseLinkResource(event) {
  event.preventDefault();
  const course = findCourse(selectedCourseId);
  if (!course) return;
  try {
    const title = resourceLinkTitleInput.value.trim();
    const [link] = parseCourseLinks(resourceLinkUrlInput.value);
    if (title) link.title = title;
    if (!course.links.some((item) => item.url === link.url)) {
      course.links.push(link);
    }
    resourceLinkForm.reset();
    renderResourceGroups(course);
    renderResourceList(course);
    scheduleSave();
  } catch (error) {
    setSaveStatus(String(error), "error");
    resourceLinkUrlInput.focus();
  }
}

document.querySelector("#edit-course").addEventListener("click", () => {
  if (activeSession || launchInProgress) {
    explainSessionLock();
    return;
  }
  const course = findCourse(selectedCourseId);
  if (course) openCourseSheet(course, false);
});
emptyAddCourseButton.addEventListener("click", () => {
  openCourseSheet(createEmptyCourse(), true);
});
nextTaskPreview.addEventListener("click", () => setActivePage("tasks"));
notesAddCourseButton.addEventListener("click", () => {
  openCourseSheet(createEmptyCourse(), true);
});
tasksAddCourseButton.addEventListener("click", () => {
  openCourseSheet(createEmptyCourse(), true);
});
resourcesAddCourseButton.addEventListener("click", () => {
  openCourseSheet(createEmptyCourse(), true);
});
document.querySelector(".brand").addEventListener("click", (event) => {
  event.preventDefault();
  setActivePage("desk");
});
settingsGearButton.addEventListener("click", openSettings);
document.querySelector("#close-settings").addEventListener("click", () => settingsDialog.close());
document.querySelector("#guide-next").addEventListener("click", advanceGuide);
document.querySelector("#guide-skip").addEventListener("click", closeGuide);
guideCard.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeGuide();
});
settingsDialog.addEventListener("close", () => settingsGearButton.setAttribute("aria-expanded", "false"));
document.querySelector("#theme-setting").addEventListener("change", updateThemeSetting);
document.querySelector("#notifications-setting").addEventListener("change", updateNotificationsSetting);
soundEffectsSetting.addEventListener("change", updateSoundEffectsSetting);
document.querySelector("#download-filing-setting").addEventListener("change", updateDownloadFilingSetting);
document.querySelectorAll("[data-component-setting]").forEach((checkbox) => {
  checkbox.addEventListener("change", updateDashboardComponentSetting);
});
downloadFilingSelect.addEventListener("change", () => {
  if (activeDownloadCandidate) activeDownloadCandidate.courseId = downloadFilingSelect.value;
});
document.querySelector("#download-filing-dismiss").addEventListener("click", dismissDownloadCandidate);
document.querySelector("#download-filing-move").addEventListener("click", moveSelectedDownload);
document.querySelector("#download-undo-action").addEventListener("click", undoSelectedDownload);
document.addEventListener("click", playInterfaceSound);
window.addEventListener("resize", positionGuideCard);
window.addEventListener("scroll", positionGuideCard, true);
new MutationObserver(() => {
  if (catBubble.hidden) return;
  catBubble.classList.remove("bubble-bounce");
  void catBubble.offsetWidth;
  catBubble.classList.add("bubble-bounce");
}).observe(catBubble, { childList: true, characterData: true });
for (const button of pageNavButtons) {
  button.addEventListener("click", () => setActivePage(button.dataset.pageTarget));
}
notesCourseSelect.addEventListener("change", () => selectWorkspaceCourse(notesCourseSelect.value));
tasksCourseSelect.addEventListener("change", () => selectWorkspaceCourse(tasksCourseSelect.value));
resourcesCourseSelect.addEventListener("change", () => selectWorkspaceCourse(resourcesCourseSelect.value));
noteCreateButton.addEventListener("click", createSelectedCourseNote);
noteSearchInput.addEventListener("input", renderNoteList);
noteList.addEventListener("click", handleNoteListClick);
noteTitleInput.addEventListener("input", updateSelectedCourseNote);
noteContentInput.addEventListener("input", updateSelectedCourseNote);
noteDeleteButton.addEventListener("click", deleteSelectedCourseNote);
document.querySelector(".note-toolbar").addEventListener("click", applyNoteFormatting);
sessionSummaryForm.addEventListener("submit", saveSessionSummary);
document.querySelector("#skip-session-summary").addEventListener("click", () => {
  if (sessionSummaryDialog.open) sessionSummaryDialog.close();
});
taskForm.addEventListener("submit", addCourseTask);
taskList.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-task-toggle]");
  if (!checkbox || !appData) return;
  appData.tasks = toggleStudyTask(appData.tasks, checkbox.dataset.taskToggle);
  renderTaskList();
  scheduleSave();
});
taskList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-task-remove]");
  if (!button || !appData) return;
  appData.tasks = appData.tasks.filter((task) => task.id !== button.dataset.taskRemove);
  renderTaskList();
  scheduleSave();
});
resourceGroupForm.addEventListener("submit", addResourceGroup);
resourceGroupList.addEventListener("click", removeSelectedResourceGroup);
resourceList.addEventListener("change", moveSelectedResource);
resourceList.addEventListener("click", handleResourceAction);
resourceLinkForm.addEventListener("submit", addCourseLinkResource);
startSessionButton.addEventListener("click", startSelectedSession);
pauseSessionButton.addEventListener("click", toggleSessionPause);
endSessionButton.addEventListener("click", () => finishSession(false));
document.querySelector("#timer-lengths").addEventListener("click", (event) => {
  const button = event.target.closest("[data-length-sec]");
  if (!button) return;
  setSessionLength(Number(button.dataset.lengthSec), true);
});
document.querySelector("#stopwatch-mode").addEventListener("click", selectStopwatchMode);
applyCustomLengthButton.addEventListener("click", applyCustomLength);
customMinutesInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    applyCustomLength();
  }
});
document.querySelector("#close-sheet").addEventListener("click", closeCourseSheet);
document.querySelector("#browse-course-folder").addEventListener("click", chooseCourseFolder);
document.querySelector("#browse-course-files").addEventListener("click", chooseCourseFiles);
document.querySelector("#resource-add-folder").addEventListener("click", chooseLibraryFolder);
document.querySelector("#resource-add-files").addEventListener("click", chooseLibraryFiles);
document.querySelector("#course-file-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-file]");
  if (!button || !editing) return;
  editing.apps = editing.apps.filter((path) => path !== button.dataset.removeFile);
  renderCourseFiles();
  updateCourseFromForm();
});
document.querySelector("#course-sheet").addEventListener("cancel", (event) => {
  event.preventDefault();
  closeCourseSheet();
});
document.querySelector("#course-sheet").addEventListener("click", (event) => {
  if (event.target === sheet) closeCourseSheet();
});
form.addEventListener("input", updateCourseFromForm);
form.addEventListener("submit", (event) => event.preventDefault());
document.querySelector("#color-options").addEventListener("click", (event) => {
  const choice = event.target.closest("[data-course-color]");
  if (!choice || !editing) return;
  editing.color = choice.dataset.courseColor;
  renderColorOptions();
  updateCourseFromForm();
});
deleteButton.addEventListener("click", deleteSelectedCourse);

for (const input of form.querySelectorAll("input, textarea")) {
  input.addEventListener("input", () => {
    if (input.id === "course-name") {
      document.querySelector("#sheet-title").textContent = input.value.trim() || "New course";
    }
  });
}

void loadCourses();

async function loadCourses() {
  setEditorEnabled(false);
  setSaveStatus("Loading your courses…");

  try {
    appData = await invoke("load_data");
    appData.tasks ??= [];
    appData.settings.downloadFilingEnabled ??= false;
    appData.settings.notifications ??= true;
    appData.settings.soundEffects ??= true;
    appData.settings.dashboardComponents ??= ["character", "course-dock", "next-task"];
    appData.courses.forEach((course) => {
      prepareCourseResources(course);
      course.filingKeywords ??= [];
    });
    const hasLegacyNotes = appData.courses.some((course) => course.notes?.length > 0);
    prepareAppNotes(appData);
    selectedLengthSec = normalizeTimerLength(appData.settings.defaultLengthSec);
    updateLengthSelection();
    selectedCourseId = appData.courses[0]?.id ?? null;
    render();
    setSaveStatus("");
    applyAppearance();
    updateReducedMotionPreference();
    reducedMotionPreference.addEventListener("change", updateReducedMotionPreference);
    setEditorEnabled(true);
    document.querySelector("#notifications-setting").checked = appData.settings.notifications;
    document.querySelector("#download-filing-setting").checked =
      appData.settings.downloadFilingEnabled;
    await setupDownloadFiling();
    await setupTrayActions();
    if (hasLegacyNotes) scheduleSave();
    showCourseNudge();
    initializeBuddy();
    if (currentBuddyState === "idle") showRandomBuddyLine();
    if (!appData.settings.tourDone) {
      window.setTimeout(() => openGuide(), 250);
    }
  } catch (error) {
    console.error("Could not load or initialize local course data.", error);
    setSaveStatus(`Could not load courses: ${String(error)}`, "error");
  }
}

function setEditorEnabled(enabled) {
  document.querySelector("#add-course").disabled = !enabled;
  document.querySelector("#edit-course").disabled = !enabled;
  const courseReady = enabled && Boolean(appData?.courses.length);
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

function findCourse(id) {
  return appData?.courses.find((course) => course.id === id);
}

function render() {
  renderCourses();
  renderSelectedCourse();
}

function renderCourses() {
  courseList.replaceChildren();
  if (!appData) return;
  if (appData.courses.length === 0) return;

  const minutes = appData.courses.map((course) => weeklyMinutes(course, appData.sessions));
  const largestTotal = Math.max(0, ...minutes);

  appData.courses.forEach((course, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "course-card";
    button.setAttribute("aria-pressed", String(course.id === selectedCourseId));
    button.setAttribute("aria-label", `${course.name}, ${formatMinutes(minutes[index])}`);
    button.style.setProperty("--course-color", course.color);
    button.addEventListener("click", () => {
      if (activeSession || launchInProgress) {
        explainSessionLock();
        return;
      }
      selectedCourseId = course.id;
      render();
      if (currentBuddyState === "idle") showRandomBuddyLine();
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

    const days = daysSinceLastStudy(course, appData.sessions);
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

function renderSelectedCourse() {
  const course = findCourse(selectedCourseId);
  const hasCourses = Boolean(appData?.courses.length);
  courseTitle.textContent = course?.name || (appData ? "Your study desk is empty" : "Loading your courses…");
  stageHint.textContent = course
    ? "Choose a focus length and start when you’re ready."
    : hasCourses
      ? "Choose a course below, or add another to your study desk."
      : appData
        ? "Create a course to start building your study space."
        : "Choose a course below, or edit one to set up its folder and links.";
  emptyAddCourseButton.hidden = !appData || hasCourses;
  emptyAddCourseButton.textContent = "Create your first course";
  catBubble.hidden = !course;
  document.querySelector(".stage").dataset.empty = String(Boolean(appData && !hasCourses));
  document.querySelector(".course-dock").dataset.empty = String(Boolean(appData && !hasCourses));
  timerDisplay.hidden = Boolean(appData && !hasCourses);
  timerLengths.hidden = Boolean(appData && !hasCourses);
  timerActions.hidden = Boolean(appData && !hasCourses);
  document.querySelector("#edit-course").hidden = !hasCourses;
  document
    .querySelector(".stage")
    .style.setProperty("--course-color", course?.color ?? COURSE_COLORS[0].value);
  renderWorkspacePages();
  updateReducedMotionPreference();
  document.querySelector("#edit-course").disabled = !course || !appData || appData.courses.length === 0;
  updateTimerControls();
  if (!guideCard.hidden) refreshGuideSteps();
}

function setActivePage(page) {
  if (!["desk", "resources", "notes", "tasks", "stats", "history"].includes(page)) return;
  activePage = page;
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

function selectWorkspaceCourse(courseId) {
  if (!findCourse(courseId)) return;
  if (activeSession || launchInProgress) {
    renderWorkspacePages();
    explainSessionLock();
    return;
  }
  selectedCourseId = courseId;
  render();
}

function renderWorkspacePages() {
  renderCourseSelect(notesCourseSelect);
  renderCourseSelect(tasksCourseSelect);
  renderCourseSelect(resourcesCourseSelect);
  const course = findCourse(selectedCourseId);

  resourcesEmptyState.hidden = Boolean(course);
  resourcesAddCourseButton.hidden = Boolean(course);
  resourceLibrary.hidden = !course;
  renderResourceGroups(course);
  renderResourceList(course);

  notesEmptyState.hidden = Boolean(course);
  notesAddCourseButton.hidden = Boolean(course);
  notesWorkspace.hidden = !course;
  if (!course || notesWorkspaceCourseId !== course.id) {
    selectedNoteId = null;
    notesWorkspaceCourseId = course?.id ?? null;
  }
  renderNotesWorkspace(course);

  tasksEmptyState.hidden = Boolean(course);
  tasksAddCourseButton.hidden = Boolean(course);
  taskForm.hidden = !course;
  renderTaskList();
  renderHistory();
  renderStats();
}

function renderCourseSelect(select) {
  const previousValue = select.value;
  select.replaceChildren();
  for (const course of appData?.courses ?? []) {
    const option = document.createElement("option");
    option.value = course.id;
    option.textContent = course.name;
    select.append(option);
  }
  select.disabled = !appData?.courses.length;
  select.value =
    appData?.courses.some((course) => course.id === selectedCourseId)
      ? selectedCourseId
      : appData?.courses.some((course) => course.id === previousValue)
        ? previousValue
        : "";
}

function renderNotesWorkspace(course) {
  if (!course) {
    renderNoteList();
    return;
  }
  const notes = notesForCourse(course.id);
  if (!notes.some((note) => note.id === selectedNoteId)) {
    selectedNoteId = [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id ?? null;
  }
  renderNoteList();
  const selectedNote = notes.find((note) => note.id === selectedNoteId);
  noteEditor.hidden = !selectedNote;
  noteNoSelection.hidden = Boolean(selectedNote);
  if (selectedNote) {
    noteTitleInput.value = selectedNote.title;
    noteContentInput.value = selectedNote.content;
    noteCharacterCount.textContent = `${[...selectedNote.content].length.toLocaleString()} characters`;
    noteSaveHintFor(selectedNote);
  }
}

function renderNoteList() {
  noteList.replaceChildren();
  const course = findCourse(selectedCourseId);
  const notes = course ? notesForCourse(course.id) : [];
  const matchingNotes = searchCourseNotes(notes, noteSearchInput.value)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  noteListEmpty.hidden = matchingNotes.length > 0;
  noteListEmpty.textContent = notes.length > 0
    ? "No notes match your search."
    : "No notes yet. Create one to get started.";

  for (const note of matchingNotes) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "note-list-item";
    button.dataset.noteSelect = note.id;
    button.setAttribute("aria-current", String(note.id === selectedNoteId));
    const title = document.createElement("strong");
    title.textContent = note.title;
    const preview = document.createElement("span");
    preview.textContent = note.content.trim().replace(/\s+/g, " ").slice(0, 72) || "Empty note";
    const updated = document.createElement("small");
    updated.textContent = formatNoteDate(note.updatedAt);
    button.append(title, preview, updated);
    item.append(button);
    noteList.append(item);
  }
}

function formatNoteDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : `Edited ${date.toLocaleDateString()}`;
}

function noteSaveHintFor(note) {
  notesSaveHint.textContent = `Last edited ${formatNoteDate(note.updatedAt).replace(/^Edited /, "")}`;
}

function notesForCourse(courseId) {
  return (appData?.notes ?? []).filter((note) => note.courseId === courseId);
}

function createSelectedCourseNote() {
  const course = findCourse(selectedCourseId);
  if (!course) return;
  const note = createCourseNote(course.id);
  if (!note) {
    setSaveStatus("Could not create a note.", "error");
    return;
  }
  appData.notes.push(note);
  selectedNoteId = note.id;
  noteSearchInput.value = "";
  renderNotesWorkspace(course);
  noteTitleInput.focus();
  noteTitleInput.select();
  scheduleSave();
}

function handleNoteListClick(event) {
  const button = event.target.closest("[data-note-select]");
  if (!button) return;
  selectedNoteId = button.dataset.noteSelect;
  renderNotesWorkspace(findCourse(selectedCourseId));
}

function updateSelectedCourseNote() {
  const course = findCourse(selectedCourseId);
  const noteIndex = appData.notes.findIndex(
    (note) => note.courseId === course?.id && note.id === selectedNoteId,
  );
  if (!course || noteIndex < 0) return;
  try {
    appData.notes[noteIndex] = updateCourseNote(
      appData.notes[noteIndex],
      { title: noteTitleInput.value, content: noteContentInput.value },
    );
  } catch (error) {
    setSaveStatus(String(error), "error");
    return;
  }
  noteCharacterCount.textContent = `${[...noteContentInput.value].length.toLocaleString()} characters`;
  renderNoteList();
  noteSaveHintFor(appData.notes[noteIndex]);
  scheduleSave(500);
}

function deleteSelectedCourseNote() {
  const course = findCourse(selectedCourseId);
  if (!course || !selectedNoteId) return;
  const note = appData.notes.find((item) => item.courseId === course.id && item.id === selectedNoteId);
  if (!note || !window.confirm(`Delete "${note.title}"? This cannot be undone.`)) return;
  appData.notes = appData.notes.filter((item) => item.id !== note.id);
  selectedNoteId = null;
  renderNotesWorkspace(course);
  scheduleSave();
}

function applyNoteFormatting(event) {
  const button = event.target.closest("[data-note-format]");
  if (!button || noteContentInput.disabled) return;
  const start = noteContentInput.selectionStart;
  const end = noteContentInput.selectionEnd;
  const selected = noteContentInput.value.slice(start, end);
  const actions = {
    heading: () => ({ before: "# ", after: "", block: true }),
    bullet: () => ({ before: "- ", after: "", block: true }),
    checklist: () => ({ before: "- [ ] ", after: "", block: true }),
    quote: () => ({ before: "> ", after: "", block: true }),
    bold: () => ({ before: "**", after: "**" }),
    italic: () => ({ before: "*", after: "*" }),
    code: () => ({ before: "`", after: "`" }),
    link: () => ({ before: "[", after: "](https://example.com)" }),
  };
  const action = actions[button.dataset.noteFormat];
  if (!action) return;
  const { before, after, block } = action();
  const text = block
    ? (selected || "List item").split("\n").map((line) => `${before}${line}`).join("\n")
    : `${before}${selected || "text"}${after}`;
  noteContentInput.setRangeText(text, start, end, "select");
  noteContentInput.focus();
  noteContentInput.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderHistory() {
  historyList.replaceChildren();
  const sessions = [...(appData?.sessions ?? [])]
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  historyEmptyState.hidden = sessions.length > 0;
  for (const session of sessions) {
    const item = document.createElement("li");
    item.className = "history-item";
    const heading = document.createElement("div");
    heading.className = "history-item-heading";
    const title = document.createElement("strong");
    title.textContent = findCourse(session.courseId)?.name ?? "Deleted course";
    const date = document.createElement("time");
    date.dateTime = session.startedAt;
    date.textContent = new Date(session.startedAt).toLocaleString();
    heading.append(title, date);
    const duration = document.createElement("p");
    const elapsedLabel = session.actualSec < 60
      ? `${session.actualSec} sec`
      : `${Math.floor(session.actualSec / 60)} min`;
    const resultLabel = session.countUp
      ? "stopwatch"
      : session.completed
        ? "completed"
        : "ended early";
    duration.textContent = `${elapsedLabel} · ${resultLabel}`;
    item.append(heading, duration);
    if (session.summary) {
      const summary = document.createElement("p");
      summary.className = "history-summary";
      summary.textContent = session.summary;
      item.append(summary);
    }
    historyList.append(item);
  }
}

function addCourseTask(event) {
  event.preventDefault();
  const course = findCourse(selectedCourseId);
  if (!course || !appData) return;
  const task = createStudyTask(course.id, newTaskTitleInput.value);
  if (!task) {
    newTaskTitleInput.focus();
    return;
  }
  appData.tasks.push(task);
  newTaskTitleInput.value = "";
  renderTaskList();
  scheduleSave();
}

function renderTaskList() {
  taskList.replaceChildren();
  const tasks = tasksForCourse(appData?.tasks ?? [], selectedCourseId);
  taskListEmpty.hidden = !findCourse(selectedCourseId) || tasks.length > 0;
  const nextTask = nextTaskForCourse(appData?.tasks ?? [], selectedCourseId);
  nextTaskPreview.hidden = !nextTask;
  if (nextTask) {
    nextTaskPreview.textContent = `Next task: ${nextTask.title}`;
    nextTaskPreview.setAttribute(
      "aria-label",
      `Next task for ${findCourse(selectedCourseId).name}: ${nextTask.title}. Open Tasks.`,
    );
  }
  for (const task of tasks) {
    const item = document.createElement("li");
    item.className = "task-item";
    item.dataset.completed = String(task.completed);

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.className = "task-toggle";
    toggle.checked = task.completed;
    toggle.dataset.taskToggle = task.id;
    toggle.setAttribute("aria-label", `${task.completed ? "Reopen" : "Complete"} ${task.title}`);

    const title = document.createElement("span");
    title.className = "task-title";
    title.textContent = task.title;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "task-remove";
    remove.dataset.taskRemove = task.id;
    remove.setAttribute("aria-label", `Remove ${task.title}`);
    remove.textContent = "×";

    item.append(toggle, title, remove);
    taskList.append(item);
  }
  applyDashboardComponents();
}

function updateReducedMotionPreference() {
  const stage = document.querySelector(".stage");
  stage.dataset.reducedMotion = String(reducedMotionPreference.matches);
  if (reducedMotionPreference.matches) {
    if (currentBuddyState === "blink") {
      setCatState("idle");
    } else {
      window.clearTimeout(buddyBlinkTimer);
      window.clearTimeout(buddyBlinkResetTimer);
    }
    buddyFrame = 0;
    renderBuddySprite();
  } else if (currentBuddyState === "idle") {
    scheduleBuddyBlink();
  }
}

function setCatState(state) {
  currentBuddyState = state;
  document.querySelector(".stage").dataset.catState = state;
  buddyFrame = 0;
  renderBuddySprite();
  window.clearTimeout(buddyBlinkTimer);
  window.clearTimeout(buddyBlinkResetTimer);
  if (state === "idle") scheduleBuddyBlink();
}

function buddyCoat() {
  const color = findCourse(selectedCourseId)?.color?.toLowerCase();
  if (color === "#5fb3a8") return "mint";
  if (color === "#dc8299") return "coral";
  if (color === "#e2b25c") return "sunny";
  return "lavender";
}

function renderBuddySprite() {
  buddyArt.innerHTML = sprite(currentBuddyState, buddyFrame, buddyCoat());
}

function initializeBuddy() {
  renderBuddySprite();
  buddyFrameTimer = window.setInterval(() => {
    if (reducedMotionPreference.matches) return;
    buddyFrame = (buddyFrame + 1) % 2;
    renderBuddySprite();
  }, 350);
  buddyIdleMessageTimer = window.setInterval(() => {
    if (
      currentBuddyState === "idle" &&
      !activeSession &&
      selectedCourseId &&
      activePage === "desk" &&
      guideCard.hidden
    ) {
      showRandomBuddyLine();
    }
  }, 22000);
}

function scheduleBuddyBlink() {
  if (reducedMotionPreference.matches || !buddyArt) return;
  buddyBlinkTimer = window.setTimeout(() => {
    if (currentBuddyState !== "idle") return;
    setCatState("blink");
    buddyBlinkResetTimer = window.setTimeout(() => setCatState("idle"), 140);
  }, 3600);
}

function showRandomBuddyLine() {
  if (!selectedCourseId || currentBuddyState !== "idle") return;
  if (idleMessageBag.length === 0) {
    idleMessageBag = [...buddyIdleMessages];
    for (let index = idleMessageBag.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [idleMessageBag[index], idleMessageBag[swapIndex]] = [
        idleMessageBag[swapIndex],
        idleMessageBag[index],
      ];
    }
    if (idleMessageBag.at(-1) === lastIdleMessage) {
      [idleMessageBag[0], idleMessageBag[idleMessageBag.length - 1]] = [
        idleMessageBag.at(-1),
        idleMessageBag[0],
      ];
    }
  }
  lastIdleMessage = idleMessageBag.pop();
  catBubble.textContent = lastIdleMessage;
}

function showCourseNudge() {
  if (nudgeShown || activeSession || !appData?.courses.length) return;
  const neglected = appData.courses
    .map((course) => ({ course, days: daysSinceLastStudy(course, appData.sessions) }))
    .find(({ days }) => days !== null && days >= 4);
  if (!neglected) return;
  nudgeShown = true;
  catBubble.textContent = `It's been ${neglected.days} days since ${neglected.course.name}.`;
  setCatState("nudge");
}

function renderStats() {
  if (!appData) return;
  document.querySelector("#stats-total-sessions").textContent = String(appData.sessions.length);
  const streak = longestStudyStreak(appData.sessions);
  document.querySelector("#stats-longest-streak").textContent = `${streak} day${streak === 1 ? "" : "s"}`;
  renderStatsBars(statsThisWeek, minutesByCourse(appData.courses, appData.sessions, 0));
  renderStatsBars(statsLastWeek, minutesByCourse(appData.courses, appData.sessions, 1));
}

function renderStatsBars(list, rows) {
  list.replaceChildren();
  const largest = Math.max(0, ...rows.map((row) => row.minutes));
  for (const row of rows) {
    const item = document.createElement("li");
    item.className = "stats-bar-row";
    const label = document.createElement("span");
    label.className = "stats-course-name";
    label.textContent = row.courseName;
    const bar = document.createElement("span");
    bar.className = "stats-bar-track";
    const value = document.createElement("span");
    value.style.width = `${largest ? (row.minutes / largest) * 100 : 0}%`;
    bar.append(value);
    const minutes = document.createElement("strong");
    minutes.textContent = row.minutes >= 60
      ? `${Math.floor(row.minutes / 60)}h ${row.minutes % 60}m`
      : `${row.minutes}m`;
    item.append(label, bar, minutes);
    list.append(item);
  }
  if (rows.length === 0) {
    const empty = document.createElement("li");
    empty.className = "stats-empty";
    empty.textContent = "Add a course to see study time.";
    list.append(empty);
  }
}

function applyAppearance() {
  const choice = appData?.settings.theme ?? "system";
  const dark = choice === "dark" ||
    (choice === "system" && colorSchemePreference.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  document.querySelector("#theme-setting").value = choice;
  document.querySelector("#notifications-setting").checked =
    appData?.settings.notifications !== false;
  soundEffectsSetting.checked = appData?.settings.soundEffects !== false;
  document.querySelector("#download-filing-setting").checked =
    appData?.settings.downloadFilingEnabled === true;
  const visible = new Set(appData?.settings.dashboardComponents ?? []);
  for (const checkbox of document.querySelectorAll("[data-component-setting]")) {
    checkbox.checked = visible.has(checkbox.dataset.componentSetting);
  }
  applyDashboardComponents();
}

function applyDashboardComponents() {
  const visible = new Set(appData?.settings.dashboardComponents ?? []);
  for (const element of document.querySelectorAll("[data-dashboard-component]")) {
    element.dataset.dashboardVisible = String(visible.has(element.dataset.dashboardComponent));
  }
}

function updateThemeSetting() {
  if (!appData) return;
  appData.settings.theme = document.querySelector("#theme-setting").value;
  applyAppearance();
  scheduleSave();
}

function updateDashboardComponentSetting(event) {
  if (!appData) return;
  const key = event.currentTarget.dataset.componentSetting;
  const visible = new Set(appData.settings.dashboardComponents);
  if (event.currentTarget.checked) visible.add(key);
  else visible.delete(key);
  appData.settings.dashboardComponents = [...visible];
  applyDashboardComponents();
  scheduleSave();
}

async function updateNotificationsSetting() {
  if (!appData) return;
  const enabled = document.querySelector("#notifications-setting").checked;
  if (enabled) {
    try {
      let granted = await isPermissionGranted();
      if (!granted) granted = (await requestPermission()) === "granted";
      if (!granted) {
        document.querySelector("#notifications-setting").checked = false;
        appData.settings.notifications = false;
        scheduleSave();
        setSaveStatus("Notifications are off because permission was not granted.", "error");
        return;
      }
    } catch (error) {
      document.querySelector("#notifications-setting").checked = false;
      appData.settings.notifications = false;
      scheduleSave();
      console.error("Could not enable notifications.", error);
      setSaveStatus(`Could not enable notifications: ${String(error)}`, "error");
      return;
    }
  }
  appData.settings.notifications = enabled;
  scheduleSave();
}

function updateSoundEffectsSetting() {
  if (!appData) return;
  appData.settings.soundEffects = soundEffectsSetting.checked;
  scheduleSave();
}

function playInterfaceSound(event) {
  if (!appData?.settings.soundEffects) return;
  const control = event.target.closest("button, a, input[type='checkbox'], select");
  if (!control || control.disabled || control.getAttribute("aria-disabled") === "true") return;
  const sound = control.matches("#start-session, #apply-custom-length") ? confirmSound : clickSound;
  sound.currentTime = 0;
  void sound.play().catch((error) => {
    console.warn("Could not play the interface sound.", error);
  });
}

async function updateDownloadFilingSetting() {
  if (!appData) return;
  const enabled = document.querySelector("#download-filing-setting").checked;
  appData.settings.downloadFilingEnabled = enabled;
  if (!await persistNow()) return;
  try {
    await invoke("set_download_watching", { enabled });
    if (enabled) {
      setSaveStatus("Downloads filing is on. Add filename keywords to a course to receive suggestions.", "success");
    } else {
      activeDownloadCandidate = null;
      downloadCandidateQueue = [];
      downloadFilingCard.hidden = true;
      setSaveStatus("Downloads filing is off.", "success");
    }
  } catch (error) {
    appData.settings.downloadFilingEnabled = !enabled;
    document.querySelector("#download-filing-setting").checked = !enabled;
    await persistNow();
    console.error("Could not update Downloads monitoring.", error);
    setSaveStatus(`Could not update Downloads monitoring: ${String(error)}`, "error");
  }
}

async function setupDownloadFiling() {
  try {
    await listen("download-filing-candidate", ({ payload }) => {
      if (!appData?.settings.downloadFilingEnabled || !payload?.path || !payload.matches?.length) return;
      if (
        activeDownloadCandidate?.path === payload.path ||
        downloadCandidateQueue.some((candidate) => candidate.path === payload.path)
      ) return;
      downloadCandidateQueue.push(payload);
      showNextDownloadCandidate();
    });
  } catch (error) {
    console.error("Could not listen for Downloads filing suggestions.", error);
    setSaveStatus(`Downloads suggestions are unavailable: ${String(error)}`, "error");
    return;
  }
  if (appData.settings.downloadFilingEnabled) {
    try {
      await invoke("set_download_watching", { enabled: true });
    } catch (error) {
      console.error("Could not start Downloads monitoring.", error);
      setSaveStatus(`Downloads filing could not start: ${String(error)}`, "error");
    }
  }
}

async function setupTrayActions() {
  try {
    await listen("tray-action", ({ payload }) => {
      if (payload === "show") {
        void showMainWindow();
      } else if (payload === "start") {
        void showMainWindow().then(() => startSelectedSession());
      } else if (payload === "toggle") {
        void showMainWindow().then(() =>
          activeSession ? toggleSessionPause() : startSelectedSession(),
        );
      } else if (payload === "quit") {
        void quitFromTray();
      }
    });
  } catch (error) {
    console.error("Could not listen for tray actions.", error);
    setSaveStatus(`Tray controls are unavailable: ${String(error)}`, "error");
  }
}

async function showMainWindow() {
  const currentWindow = getCurrentWindow();
  await currentWindow.show();
  await currentWindow.setFocus();
}

async function quitFromTray() {
  quitRequested = true;
  if (sessionSummaryDialog.open) sessionSummaryDialog.close();
  if (activeSession) await finishSession(false);
  await writeQueue;
  await invoke("quit_from_tray");
}

function showNextDownloadCandidate() {
  if (activeDownloadCandidate || downloadCandidateQueue.length === 0) return;
  activeDownloadCandidate = downloadCandidateQueue.shift();
  document.querySelector("#download-filing-title").textContent =
    `Move ${activeDownloadCandidate.filename} to a course?`;
  downloadFilingSelect.replaceChildren();
  for (const match of activeDownloadCandidate.matches) {
    const option = document.createElement("option");
    option.value = match.courseId;
    option.textContent = match.courseName;
    downloadFilingSelect.append(option);
  }
  activeDownloadCandidate.courseId = activeDownloadCandidate.matches[0].courseId;
  downloadFilingCard.hidden = false;
}

function dismissDownloadCandidate() {
  activeDownloadCandidate = null;
  downloadFilingCard.hidden = true;
  showNextDownloadCandidate();
}

async function moveSelectedDownload() {
  const candidate = activeDownloadCandidate;
  if (!candidate) return;
  const moveButton = document.querySelector("#download-filing-move");
  moveButton.disabled = true;
  try {
    const receipt = await invoke("move_download_file", {
      courseId: candidate.courseId,
      path: candidate.path,
    });
    activeDownloadCandidate = null;
    downloadFilingCard.hidden = true;
    showUndoReceipt(receipt);
    showNextDownloadCandidate();
    setSaveStatus(`Moved to ${receipt.to}`, "success");
  } catch (error) {
    console.error("Could not file the downloaded resource.", error);
    setSaveStatus(`Could not move the file. It remains in Downloads: ${String(error)}`, "error");
  } finally {
    moveButton.disabled = false;
  }
}

function showUndoReceipt(receipt) {
  window.clearTimeout(undoExpirationTimer);
  activeUndoId = receipt.id;
  const filename = receipt.to.split(/[\\/]/).at(-1) || "file";
  document.querySelector("#download-undo-message").textContent =
    `Filed ${filename}. You can undo this for 10 minutes.`;
  downloadUndoCard.hidden = false;
  undoExpirationTimer = window.setTimeout(() => {
    if (activeUndoId === receipt.id) {
      activeUndoId = null;
      downloadUndoCard.hidden = true;
    }
  }, Math.max(0, receipt.undoUntil * 1000 - Date.now()));
}

async function undoSelectedDownload() {
  if (!activeUndoId) return;
  const id = activeUndoId;
  try {
    await invoke("undo_download_move", { id });
    activeUndoId = null;
    window.clearTimeout(undoExpirationTimer);
    downloadUndoCard.hidden = true;
    setSaveStatus("File returned to Downloads.", "success");
  } catch (error) {
    console.error("Could not undo the file move.", error);
    setSaveStatus(`Could not undo the move: ${String(error)}`, "error");
  }
}

function openSettings() {
  if (!appData) return;
  applyAppearance();
  settingsGearButton.setAttribute("aria-expanded", "true");
  settingsDialog.showModal();
}

function openGuide() {
  if (!guideCard.hidden || appData?.settings.tourDone) return;
  guideSteps = createGuideSteps();
  guideStep = 0;
  guideScrim.hidden = false;
  guideCard.hidden = false;
  renderGuideStep();
  document.querySelector("#guide-next").focus();
}

function createGuideSteps() {
  const hasCourses = Boolean(appData?.courses.length);
  const steps = [
    {
      id: "welcome",
      title: "Welcome to Desk Drawer Study",
      copy: "Your study space starts empty. This quick tour will point out the real controls; you can use them while the guide is open.",
      target: null,
    },
    {
      id: "course",
      title: hasCourses ? "Choose a course" : "Create your first course",
      copy: hasCourses
        ? "Your courses live here. Select one to bring its timer, notes, tasks, and resources into view."
        : "Start with a course. Add only the folders, links, notes, and tasks you need; nothing is pre-filled.",
      target: hasCourses ? "#course-list" : "#add-course",
    },
  ];
  if (hasCourses) {
    steps.push(
      {
        id: "timer",
        title: "Choose how to focus",
        copy: "The Stopwatch starts at 0:00 and counts up. Or choose a countdown length.",
        target: "#timer-lengths",
      },
      {
        id: "start",
        title: "Start your study session",
        copy: "Start opens the selected course resources and begins tracking your session.",
        target: "#start-session",
      },
    );
  }
  steps.push(
    {
      id: "workspace",
      title: "Keep your study tools close",
      copy: "Open Resources, Notes, Tasks, Stats, and History from the navigation.",
      target: '[data-page-target="resources"]',
    },
    {
      id: "settings",
      title: "Make it yours",
      copy: "Change appearance, session notifications, sounds, and the items shown on your desk here.",
      target: "#open-settings",
    },
  );
  return steps;
}

function refreshGuideSteps() {
  const currentId = guideSteps[guideStep]?.id;
  guideSteps = createGuideSteps();
  const updatedIndex = guideSteps.findIndex((step) => step.id === currentId);
  guideStep = updatedIndex < 0 ? 0 : updatedIndex;
  renderGuideStep();
}

function renderGuideStep() {
  const step = guideSteps[guideStep];
  clearGuideTarget();
  document.querySelector("#guide-step-label").textContent = `Step ${guideStep + 1} of ${guideSteps.length}`;
  document.querySelector("#guide-heading").textContent = step.title;
  document.querySelector("#guide-copy").textContent = step.copy;
  document.querySelector("#guide-next").textContent = guideStep === guideSteps.length - 1 ? "Finish" : "Next";
  const progress = document.querySelector("#guide-progress");
  progress.replaceChildren();
  guideSteps.forEach((_, index) => {
    const dot = document.createElement("span");
    dot.dataset.active = String(index === guideStep);
    progress.append(dot);
  });
  if (step.target) {
    const target = document.querySelector(step.target);
    target?.classList.add("guide-target");
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  requestAnimationFrame(positionGuideCard);
}

function clearGuideTarget() {
  document.querySelectorAll(".guide-target").forEach((element) => element.classList.remove("guide-target"));
}

function positionGuideCard() {
  if (guideCard.hidden) return;
  const target = document.querySelector(".guide-target");
  const rect = target?.getBoundingClientRect();
  const cardRect = guideCard.getBoundingClientRect();
  const margin = 18;
  let top = Math.max(margin, (window.innerHeight - cardRect.height) / 2);
  let left = (window.innerWidth - cardRect.width) / 2;
  if (rect && rect.width && rect.height) {
    top = rect.bottom + cardRect.height + margin < window.innerHeight
      ? rect.bottom + margin
      : Math.max(margin, rect.top - cardRect.height - margin);
    left = Math.min(
      window.innerWidth - cardRect.width - margin,
      Math.max(margin, rect.left + rect.width / 2 - cardRect.width / 2),
    );
  }
  guideCard.style.top = `${top}px`;
  guideCard.style.left = `${left}px`;
}

function advanceGuide() {
  if (guideStep === guideSteps.length - 1) {
    closeGuide();
    return;
  }
  guideStep += 1;
  renderGuideStep();
}

function closeGuide() {
  clearGuideTarget();
  guideCard.hidden = true;
  guideScrim.hidden = true;
  guideCard.style.removeProperty("top");
  guideCard.style.removeProperty("left");
  if (appData && !appData.settings.tourDone) {
    appData.settings.tourDone = true;
    scheduleSave();
  }
}

async function startSelectedSession() {
  const course = findCourse(selectedCourseId);
  if (!course || launchInProgress || activeSession || sessionFinishing) return;

  launchInProgress = true;
  updateTimerControls();
  await persistNow();
  if (!findCourse(course.id)) {
    launchInProgress = false;
    updateTimerControls();
    return;
  }

  const startedAt = Date.now();
  const sessionId = crypto.randomUUID();
  const countUp = selectedTimerMode === "stopwatch";
  activeSession = {
    id: sessionId,
    courseId: course.id,
    plannedSec: countUp ? 0 : selectedLengthSec,
    countUp,
    startedAt: new Date(startedAt).toISOString(),
    startedAtMs: startedAt,
    deadlineMs: countUp ? null : startedAt + selectedLengthSec * 1000,
    pausedRemainingMs: null,
    pausedElapsedMs: null,
  };
  void invoke("set_session_running", { running: true }).catch((error) => {
    console.error("Could not register the active session with the tray.", error);
    setSaveStatus(`Tray session state could not be updated: ${String(error)}`, "error");
  });
  setCatState("focus");
  catBubble.textContent = `Timer's running. I'll be here.`;
  delete catBubble.dataset.state;
  beginTimerUpdates();
  updateTimerControls();

  try {
    const report = await invoke("launch_course", { courseId: course.id });
    for (const failure of report.failures) {
      console.error(`Could not open course resource (${failure.kind}): ${failure.target}`, failure.reason);
    }
    if (activeSession?.id === sessionId) {
      const message = launchMessage(report);
      const emptyCourse = !report.folderOpened && report.linksOpened === 0 && report.appsOpened === 0;
      catBubble.textContent =
        report.failures.length > 0 || emptyCourse
          ? `${message} Your timer is still running.`
          : message;
      catBubble.dataset.state = report.failures.length > 0 ? "error" : "success";
    }
  } catch (error) {
    console.error("Could not open course resources.", error);
    if (activeSession?.id === sessionId) {
      catBubble.textContent = `Could not open ${course.name}. Check the folder and links in Edit. Your timer is still running.`;
      catBubble.dataset.state = "error";
    }
  } finally {
    launchInProgress = false;
    updateTimerControls();
  }
}

function setSessionLength(seconds, saveAsDefault) {
  if (activeSession || launchInProgress) {
    catBubble.textContent = "Wait for the session to start or finish it before changing its length.";
    return;
  }

  selectedTimerMode = "countdown";
  selectedLengthSec = seconds;
  timerDisplay.textContent = formatTimer(seconds);
  timerDisplay.setAttribute("aria-label", `Time remaining ${formatTimer(seconds)}`);
  lastTimerSecond = seconds;
  updateLengthSelection();

  if (saveAsDefault && appData && appData.settings.defaultLengthSec !== seconds) {
    appData.settings.defaultLengthSec = seconds;
    scheduleSave();
  }
}

function selectStopwatchMode() {
  if (activeSession || launchInProgress) {
    catBubble.textContent = "Wait for the session to finish before changing its timer.";
    return;
  }

  selectedTimerMode = "stopwatch";
  timerDisplay.textContent = "00:00";
  timerDisplay.setAttribute("aria-label", "Elapsed time 00:00");
  lastTimerSecond = 0;
  updateLengthSelection();
}

function applyCustomLength() {
  if (activeSession || launchInProgress) {
    catBubble.textContent = "Wait for the session to start or finish it before changing its length.";
    return;
  }

  const seconds = parseCustomMinutes(customMinutesInput.value);
  if (seconds === null) {
    catBubble.textContent = "Choose a whole number of minutes from 1 to 180.";
    customMinutesInput.focus();
    return;
  }
  setSessionLength(seconds, true);
  customMinutesInput.value = "";
}

function updateLengthSelection() {
  const locked = Boolean(activeSession || launchInProgress);
  const stopwatchButton = document.querySelector("#stopwatch-mode");
  stopwatchButton.setAttribute("aria-pressed", String(selectedTimerMode === "stopwatch"));
  stopwatchButton.disabled = locked;
  stopwatchButton.title = locked
    ? "Wait for the session to finish before changing its timer."
    : "Start at zero and count up.";
  for (const button of timerLengthButtons) {
    button.setAttribute(
      "aria-pressed",
      String(selectedTimerMode === "countdown" && Number(button.dataset.lengthSec) === selectedLengthSec),
    );
    button.disabled = locked;
    button.title = locked
      ? "Wait for the session to start or finish it before changing its length."
      : `Choose ${button.textContent.trim()} as the focus length.`;
  }
  customMinutesInput.disabled = locked;
  applyCustomLengthButton.disabled = locked;
  applyCustomLengthButton.title = locked
    ? "Wait for the session to start or finish it before changing its length."
    : "Set a custom focus length.";
}

function updateTimerControls() {
  const course = findCourse(selectedCourseId);
  const isPaused = activeSession
    ? activeSession.countUp
      ? activeSession.pausedElapsedMs !== null
      : activeSession.pausedRemainingMs !== null
    : false;
  startSessionButton.hidden = Boolean(activeSession);
  pauseSessionButton.hidden = !activeSession;
  endSessionButton.hidden = !activeSession;
  startSessionButton.disabled = !course || !appData || launchInProgress || sessionFinishing;
  pauseSessionButton.textContent = isPaused ? "Resume" : "Pause";
  pauseSessionButton.disabled = !activeSession || sessionFinishing;
  endSessionButton.disabled = !activeSession || sessionFinishing;
  document.querySelector("#add-course").disabled = !appData;
  document.querySelector("#edit-course").disabled = !course;
  updateLengthSelection();
}

function explainSessionLock() {
  catBubble.textContent = launchInProgress && !activeSession
    ? "Your session is starting. Wait a moment before changing courses or editing them."
    : "Finish or end this session before changing courses or editing them.";
}

function beginTimerUpdates() {
  window.clearInterval(timerInterval);
  lastTimerSecond = null;
  updateTimerDisplay();
  timerInterval = window.setInterval(updateTimerDisplay, 250);
}

function updateTimerDisplay() {
  if (!activeSession) return;
  const elapsedMs = activeSession.countUp
    ? elapsedMilliseconds(activeSession.startedAtMs, activeSession.pausedElapsedMs)
    : null;
  const remainingMs = activeSession.countUp
    ? null
    : remainingMilliseconds(activeSession.deadlineMs, activeSession.pausedRemainingMs);
  const seconds = activeSession.countUp
    ? Math.floor(elapsedMs / 1000)
    : remainingSeconds(activeSession.deadlineMs, activeSession.pausedRemainingMs);
  const progress = activeSession.countUp
    ? Math.max(0, 1 - elapsedMs / (Math.max(1, selectedLengthSec) * 1000))
    : timerProgress(
        activeSession.deadlineMs,
        activeSession.plannedSec,
        activeSession.pausedRemainingMs,
      );
  timerHalo.hidden = progress <= 0 || (!activeSession.countUp && remainingMs <= 0);
  timerHaloProgress.style.strokeDashoffset = String(haloCircumference * (1 - progress));

  if (seconds !== lastTimerSecond) {
    lastTimerSecond = seconds;
    const text = formatTimer(seconds);
    timerDisplay.textContent = text;
    timerDisplay.setAttribute(
      "aria-label",
      `${activeSession.countUp ? "Elapsed time" : "Time remaining"} ${text}`,
    );
    const course = findCourse(activeSession.courseId);
    setNativeWindowTitle(
      activeSession.countUp
        ? `Desk Drawer Study - ${activeSession.pausedElapsedMs === null ? "" : "Paused "}${text} | ${course?.name ?? "Study session"}`
        : activeSession.pausedRemainingMs === null
          ? `Desk Drawer Study - ${text} | ${course?.name ?? "Study session"}`
          : `Desk Drawer Study - Paused ${text} | ${course?.name ?? "Study session"}`,
    );
  }

  if (!activeSession.countUp && remainingMs <= 0) {
    void finishSession(true);
  }
}

function setNativeWindowTitle(title) {
  if (title === lastWindowTitle) return;
  lastWindowTitle = title;
  void getCurrentWindow()
    .setTitle(title)
    .catch((error) => console.error("Could not update the timer window title.", error));
}

function toggleSessionPause() {
  if (!activeSession || sessionFinishing) return;

  if (activeSession.countUp && activeSession.pausedElapsedMs === null) {
    activeSession.pausedElapsedMs = elapsedMilliseconds(
      activeSession.startedAtMs,
      null,
    );
    const course = findCourse(activeSession.courseId);
    setNativeWindowTitle(
      `Desk Drawer Study - Paused ${formatTimer(Math.floor(activeSession.pausedElapsedMs / 1000))} | ${course?.name ?? "Study session"}`,
    );
    window.clearInterval(timerInterval);
    timerInterval = null;
    catBubble.textContent = "Paused.";
    setCatState("paused");
    delete catBubble.dataset.state;
    updateTimerDisplay();
    updateTimerControls();
    return;
  }

  if (!activeSession.countUp && activeSession.pausedRemainingMs === null) {
    activeSession.pausedRemainingMs = remainingMilliseconds(
      activeSession.deadlineMs,
      null,
    );
    const remaining = remainingSeconds(
      activeSession.deadlineMs,
      activeSession.pausedRemainingMs,
    );
    const course = findCourse(activeSession.courseId);
    setNativeWindowTitle(
      `Desk Drawer Study - Paused ${formatTimer(remaining)} | ${course?.name ?? "Study session"}`,
    );
    window.clearInterval(timerInterval);
    timerInterval = null;
    catBubble.textContent = "Paused.";
    setCatState("paused");
    delete catBubble.dataset.state;
    updateTimerDisplay();
    updateTimerControls();
    return;
  }

  if (activeSession.countUp) {
    activeSession.startedAtMs = Date.now() - activeSession.pausedElapsedMs;
    activeSession.pausedElapsedMs = null;
  } else {
    activeSession.deadlineMs = Date.now() + activeSession.pausedRemainingMs;
    activeSession.pausedRemainingMs = null;
  }
  catBubble.textContent = "Back to it.";
  setCatState("focus");
  delete catBubble.dataset.state;
  beginTimerUpdates();
  updateTimerControls();
}

async function finishSession(completed) {
  if (!activeSession || sessionFinishing) return;
  sessionFinishing = true;
  const session = activeSession;
  const elapsedMs = session.countUp
    ? elapsedMilliseconds(session.startedAtMs, session.pausedElapsedMs)
    : null;
  const remainingMs = session.countUp
    ? null
    : remainingMilliseconds(session.deadlineMs, session.pausedRemainingMs);
  const didComplete = !session.countUp && (completed || remainingMs <= 0);
  const actualMs = session.countUp
    ? elapsedMs
    : didComplete
      ? session.plannedSec * 1000
      : Math.max(0, session.plannedSec * 1000 - remainingMs);
  const record = createSessionRecord({
    courseId: session.courseId,
    startedAt: session.startedAt,
    plannedSec: session.plannedSec,
    actualMs,
    completed: didComplete,
    countUp: session.countUp,
  });

  activeSession = null;
  void invoke("set_session_running", { running: false }).catch((error) => {
    console.error("Could not clear the active tray session.", error);
    setSaveStatus(`Tray session state could not be updated: ${String(error)}`, "error");
  });
  window.clearInterval(timerInterval);
  timerInterval = null;
  sessionFinishing = false;
  timerHalo.hidden = true;
  const resetSeconds = session.countUp || didComplete ? 0 : selectedLengthSec;
  timerDisplay.textContent = formatTimer(resetSeconds);
  timerDisplay.setAttribute(
    "aria-label",
    `${session.countUp ? "Elapsed time" : "Time remaining"} ${formatTimer(resetSeconds)}`,
  );
  lastTimerSecond = resetSeconds;
  setNativeWindowTitle("Desk Drawer Study");

  if (record) {
    appData.sessions.push(record);
    latestSessionId = record.id;
    renderCourses();
    renderHistory();
    const loggedDuration =
      record.actualSec < 60
        ? `${record.actualSec} sec`
        : `${Math.floor(record.actualSec / 60)} min`;
    if (session.countUp) {
      catBubble.textContent = `Session ended. ${loggedDuration} logged.`;
    } else if (didComplete) {
      catBubble.textContent = `Nice work: ${sessionLengthLabel(record.plannedSec)} on ${findCourse(session.courseId)?.name ?? "your course"}.`;
    } else {
      catBubble.textContent = `Stopped early. ${loggedDuration} logged.`;
    }
    setCatState(didComplete ? "done" : "idle");
    window.clearTimeout(doneStateTimer);
    if (didComplete) {
      doneStateTimer = window.setTimeout(() => {
        if (!activeSession) setCatState("idle");
      }, 4000);
    }
    await persistNow();
    if (appData.settings.notifications) {
     void notifySessionEnd(findCourse(session.courseId)?.name ?? "your course");
    }
    sessionSummaryInput.value = "";
    if (!quitRequested) sessionSummaryDialog.showModal();
  } else {
    catBubble.textContent = "Stopped early. Under 5 seconds, so no session was logged.";
    setCatState("idle");
  }
  updateTimerControls();
  if (launchInProgress) {
    catBubble.textContent += " Your course resources are still opening.";
  }
}

function sessionLengthLabel(seconds) {
  return seconds < 60 ? `${seconds} sec` : `${Math.floor(seconds / 60)} min`;
}

async function notifySessionEnd(courseName) {
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (granted) {
      await sendNotification({
        title: "Study session saved",
        body: `Your session for ${courseName} is in History.`,
      });
    } else {
      setSaveStatus("Session saved. Allow notifications in Settings to receive alerts.", "error");
    }
  } catch (error) {
    console.error("Could not send the session-end notification.", error);
    setSaveStatus(`Could not send a notification: ${String(error)}`, "error");
  }
}

function openCourseSheet(course, isNew) {
  if (!appData) return;
  editing = { ...prepareCourseResources(structuredClone(course)), isNew };
  form.reset();
  document.querySelector("#course-name").value = editing.name;
  document.querySelector("#course-filing-keywords").value = editing.filingKeywords.join(", ");
  document.querySelector("#course-folder").value = editing.folder;
  document.querySelector("#course-links").value = courseLinksText(editing.links);
  document.querySelector("#sheet-title").textContent = editing.name || "New course";
  renderCourseFiles();
  showFormMessage("");
  renderColorOptions();
  renderDeleteState();

  if (!sheet.open) sheet.showModal();
  document.querySelector("#course-name").focus();
}

async function chooseCourseFolder() {
  if (!editing) return;
  try {
    const folder = await open({
      directory: true,
      multiple: false,
      canCreateDirectories: true,
      title: "Choose or create a course folder",
    });
    if (folder === null) return;
    document.querySelector("#course-folder").value = folder;
    updateCourseFromForm();
  } catch (error) {
    console.error("Could not choose a course folder.", error);
    showFormMessage(`Could not choose a folder: ${String(error)}`, "error");
  }
}

async function chooseCourseFiles() {
  if (!editing) return;
  try {
    const selected = await open({
      directory: false,
      multiple: true,
      title: "Add course files or apps",
    });
    if (selected === null) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    editing.apps = [...new Set([...editing.apps, ...paths])];
    renderCourseFiles();
    updateCourseFromForm();
  } catch (error) {
    console.error("Could not choose course files.", error);
    showFormMessage(`Could not choose files: ${String(error)}`, "error");
  }
}

function renderCourseFiles() {
  const list = document.querySelector("#course-file-list");
  list.replaceChildren();

  for (const path of editing?.apps ?? []) {
    const item = document.createElement("li");
    item.className = "course-file-item";
    const details = document.createElement("span");
    details.className = "course-file-details";
    const name = document.createElement("strong");
    name.textContent = path.split(/[\\/]/).at(-1) || path;
    name.title = path;
    const location = document.createElement("small");
    location.textContent = path;
    details.append(name, location);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "course-file-remove";
    remove.dataset.removeFile = path;
    remove.setAttribute("aria-label", `Remove ${name.textContent}`);
    remove.textContent = "Remove";
    item.append(details, remove);
    list.append(item);
  }
}

function renderColorOptions() {
  const choices = document.querySelector("#color-options");
  choices.replaceChildren();

  for (const color of COURSE_COLORS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "color-choice";
    button.dataset.courseColor = color.value;
    button.style.setProperty("--swatch-color", color.value);
    button.setAttribute("aria-label", color.name);
    button.setAttribute("aria-pressed", String(editing?.color === color.value));
    choices.append(button);
  }
}

function renderDeleteState() {
  const course = editing && findCourse(editing.id);
  const canDelete = Boolean(course && appData.courses.length > 1);
  deleteButton.disabled = !canDelete;
  deleteHint.textContent = course && !canDelete ? "Keep at least one course." : "";
}

function updateCourseFromForm() {
  if (!editing || !appData) return;

  const name = document.querySelector("#course-name").value.trim();
  if (!name) {
    showFormMessage("Add a course name to save your changes.", "error");
    return;
  }

  try {
    const candidate = {
      id: editing.id,
      name,
      color: editing.color,
      folder: document.querySelector("#course-folder").value.trim(),
      additionalFolders: [...editing.additionalFolders],
      links: parseCourseLinks(document.querySelector("#course-links").value),
      apps: [...editing.apps],
      resourceGroups: [...editing.resourceGroups],
      resourceAssignments: [...editing.resourceAssignments],
      filingKeywords: document.querySelector("#course-filing-keywords").value
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean),
      notes: findCourse(editing.id)?.notes ?? editing.notes,
      createdAt: editing.createdAt,
    };
    const validTargets = new Set([
      ...candidate.additionalFolders.map((target) => `folder\u0000${target}`),
      ...candidate.links.map((link) => `link\u0000${link.url}`),
      ...candidate.apps.map((target) => `file\u0000${target}`),
      ...(candidate.folder ? [`folder\u0000${candidate.folder}`] : []),
    ]);
    candidate.resourceAssignments = candidate.resourceAssignments.filter(
      (assignment) => validTargets.has(`${assignment.kind}\u0000${assignment.target}`),
    );

    if (candidate.folder.length > 4096 || candidate.apps.some((path) => path.length > 4096)) {
      throw new Error("Folder and app paths must be 4,096 characters or fewer.");
    }
    if (
      candidate.filingKeywords.length > 50 ||
      candidate.filingKeywords.some((keyword) => [...keyword].length > 80)
    ) {
      throw new Error("Use up to 50 filename keywords, each 80 characters or fewer.");
    }
    if ([...candidate.notes].length > 10000) {
      throw new Error("Notes must be 10,000 characters or fewer.");
    }

    editing = candidate;
    appData.courses = upsertCourse(appData.courses, candidate);
    selectedCourseId = candidate.id;
    document.querySelector("#sheet-title").textContent = candidate.name;
    showFormMessage("");
    render();
    renderDeleteState();
    scheduleSave();
  } catch (error) {
    showFormMessage(String(error), "error");
  }
}

function scheduleSave(delay = 350) {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void persistNow();
  }, delay);
}

async function persistNow() {
  window.clearTimeout(saveTimer);
  saveTimer = null;
  if (!appData) return false;

  const revision = ++saveRevision;
  const snapshot = structuredClone(appData);
  const write = writeQueue
    .catch(() => undefined)
    .then(() => invoke("save_data", { data: snapshot }));
  writeQueue = write;

  try {
    await write;
    if (revision === saveRevision) {
      setSaveStatus("");
      if (editing) showFormMessage("");
    }
    return true;
  } catch (error) {
    console.error("Could not save course changes.", error);
    if (revision === saveRevision) {
      setSaveStatus(`Could not save changes: ${String(error)}`, "error");
      if (editing) showFormMessage(`Could not save: ${String(error)}`, "error");
    }
    return false;
  }
}

async function saveSessionSummary(event) {
  event.preventDefault();
  const summary = sessionSummaryInput.value.trim();
  const session = appData?.sessions.find((item) => item.id === latestSessionId);
  if (session && summary) {
    session.summary = summary;
    renderHistory();
    await persistNow();
  }
  if (sessionSummaryDialog.open) sessionSummaryDialog.close();
}

async function closeCourseSheet() {
  await persistNow();
  if (sheet.open) sheet.close();
  editing = null;
}

function showFormMessage(message, state = "") {
  formMessage.textContent = message;
  if (state) {
    formMessage.dataset.state = state;
  } else {
    delete formMessage.dataset.state;
  }
}

function setSaveStatus(message, state = "") {
  window.clearTimeout(statusTimer);
  saveStatus.textContent = message;
  if (state) {
    saveStatus.dataset.state = state;
  } else {
    delete saveStatus.dataset.state;
  }
  if (message && state === "success") {
    statusTimer = window.setTimeout(() => {
      saveStatus.textContent = "";
      delete saveStatus.dataset.state;
    }, 2600);
  }
}

async function deleteSelectedCourse() {
  const course = findCourse(editing?.id);
  if (!course || appData.courses.length <= 1) return;
  if (!window.confirm(`Delete ${course.name}? This cannot be undone.`)) return;

  appData.courses = removeCourse(appData.courses, course.id);
  appData.tasks = appData.tasks.filter((task) => task.courseId !== course.id);
  appData.notes = appData.notes.filter((note) => note.courseId !== course.id);
  selectedCourseId = appData.courses[0].id;
  editing = null;
  render();
  sheet.close();
  await persistNow();
}

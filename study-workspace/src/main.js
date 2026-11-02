// Desk Drawer Study entry point: wires events and starts the app. Feature code lives in ./app/.
import { appState } from "./app/state.js";
import { createEmptyCourse } from "./course-model.js";
import { toggleStudyTask } from "./task-model.js";
import { addCourseLinkResource, addResourceGroup, chooseLibraryFiles, chooseLibraryFolder, handleResourceAction, moveSelectedResource, removeSelectedResourceGroup } from "./app/resources.js";
import { addCourseTask, renderTaskList } from "./app/tasks.js";
import { advanceGuide, closeGuide, positionGuideCard } from "./app/guide.js";
import { applyAppearance, openSettings, playInterfaceSound, updateDashboardComponentSetting, updateNotificationsSetting, updateSoundEffectsSetting, updateThemeSetting } from "./app/settings.js";
import { applyCustomLength, explainSessionLock, finishSession, saveSessionSummary, selectStopwatchMode, setSessionLength, startSelectedSession, toggleSessionPause } from "./app/session.js";
import { applyCustomLengthButton, catBubble, colorSchemePreference, customMinutesInput, deleteButton, downloadFilingSelect, emptyAddCourseButton, endSessionButton, form, guideCard, nextTaskPreview, noteContentInput, noteCreateButton, noteDeleteButton, noteList, noteSearchInput, noteTitleInput, notesAddCourseButton, notesCourseSelect, pageNavButtons, pauseSessionButton, resourceGroupForm, resourceGroupList, resourceLinkForm, resourceList, resourcesAddCourseButton, resourcesCourseSelect, sessionSummaryDialog, sessionSummaryForm, settingsDialog, settingsGearButton, sheet, soundEffectsSetting, startSessionButton, taskForm, taskList, tasksAddCourseButton, tasksCourseSelect } from "./app/dom.js";
import { applyNoteFormatting, createSelectedCourseNote, deleteSelectedCourseNote, handleNoteListClick, renderNoteList, updateSelectedCourseNote } from "./app/notes.js";
import { chooseCourseFiles, chooseCourseFolder, closeCourseSheet, deleteSelectedCourse, openCourseSheet, renderColorOptions, renderCourseFiles, updateCourseFromForm } from "./app/course-sheet.js";
import { dismissDownloadCandidate, moveSelectedDownload, undoSelectedDownload, updateDownloadFilingSetting } from "./app/downloads.js";
import { findCourse, loadCourses, selectWorkspaceCourse, setActivePage } from "./app/workspace.js";
import { scheduleSave } from "./app/persistence.js";

colorSchemePreference.addEventListener("change", () => {
  if (appState.appData?.settings.theme === "system") applyAppearance();
});

document.querySelector("#add-course").addEventListener("click", () => {
  if (appState.activeSession || appState.launchInProgress) {
    explainSessionLock();
    return;
  }
  openCourseSheet(createEmptyCourse(), true);
});

document.querySelector("#edit-course").addEventListener("click", () => {
  if (appState.activeSession || appState.launchInProgress) {
    explainSessionLock();
    return;
  }
  const course = findCourse(appState.selectedCourseId);
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
  if (appState.activeDownloadCandidate) appState.activeDownloadCandidate.courseId = downloadFilingSelect.value;
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
  if (!checkbox || !appState.appData) return;
  appState.appData.tasks = toggleStudyTask(appState.appData.tasks, checkbox.dataset.taskToggle);
  renderTaskList();
  scheduleSave();
});

taskList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-task-remove]");
  if (!button || !appState.appData) return;
  appState.appData.tasks = appState.appData.tasks.filter((task) => task.id !== button.dataset.taskRemove);
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
  if (!button || !appState.editing) return;
  appState.editing.apps = appState.editing.apps.filter((path) => path !== button.dataset.removeFile);
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
  if (!choice || !appState.editing) return;
  appState.editing.color = choice.dataset.courseColor;
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

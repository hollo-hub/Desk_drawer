export const courseList = document.querySelector("#course-list");

export const pageNavButtons = [...document.querySelectorAll("[data-page-target]")];

export const appPages = [...document.querySelectorAll(".app-page")];

export const courseTitle = document.querySelector("#course-title");

export const catBubble = document.querySelector("#cat-bubble");

export const buddyArt = document.querySelector("#buddy-art");

export const saveStatus = document.querySelector("#save-status");

export const timerDisplay = document.querySelector("#timer-display");

export const timerHalo = document.querySelector("#timer-halo");

export const timerHaloProgress = document.querySelector("#timer-halo-progress");

export const timerLengths = document.querySelector("#timer-lengths");

export const timerActions = document.querySelector(".timer-actions");

export const stageHint = document.querySelector("#stage-hint");

export const nextTaskPreview = document.querySelector("#next-task-preview");

export const emptyAddCourseButton = document.querySelector("#empty-add-course");

export const notesCourseSelect = document.querySelector("#notes-course-select");

export const tasksCourseSelect = document.querySelector("#tasks-course-select");

export const resourcesCourseSelect = document.querySelector("#resources-course-select");

export const notesEmptyState = document.querySelector("#notes-empty-state");

export const notesAddCourseButton = document.querySelector("#notes-add-course");

export const notesWorkspace = document.querySelector("#notes-workspace");

export const notesSaveHint = document.querySelector("#notes-save-hint");

export const noteSearchInput = document.querySelector("#note-search");

export const noteCreateButton = document.querySelector("#note-create");

export const noteListEmpty = document.querySelector("#note-list-empty");

export const noteList = document.querySelector("#note-list");

export const noteEditor = document.querySelector("#note-editor");

export const noteNoSelection = document.querySelector("#note-no-selection");

export const noteTitleInput = document.querySelector("#note-title");

export const noteContentInput = document.querySelector("#note-content");

export const noteDeleteButton = document.querySelector("#note-delete");

export const noteCharacterCount = document.querySelector("#note-character-count");

export const tasksEmptyState = document.querySelector("#tasks-empty-state");

export const tasksAddCourseButton = document.querySelector("#tasks-add-course");

export const taskListEmpty = document.querySelector("#task-list-empty");

export const taskForm = document.querySelector("#task-form");

export const newTaskTitleInput = document.querySelector("#new-task-title");

export const newTaskDueDateInput = document.querySelector("#new-task-due-date");

export const taskList = document.querySelector("#task-list");

export const resourcesEmptyState = document.querySelector("#resources-empty-state");

export const resourcesAddCourseButton = document.querySelector("#resources-add-course");

export const resourceLibrary = document.querySelector("#resource-library");

export const resourceGroupForm = document.querySelector("#resource-group-form");

export const newResourceGroupInput = document.querySelector("#new-resource-group");

export const resourceGroupList = document.querySelector("#resource-group-list");

export const resourceListEmpty = document.querySelector("#resource-list-empty");

export const resourceList = document.querySelector("#resource-list");

export const resourceLinkForm = document.querySelector("#resource-link-form");

export const resourceLinkTitleInput = document.querySelector("#resource-link-title");

export const resourceLinkUrlInput = document.querySelector("#resource-link-url");

export const startSessionButton = document.querySelector("#start-session");

export const pauseSessionButton = document.querySelector("#pause-session");

export const endSessionButton = document.querySelector("#end-session");

export const timerLengthButtons = [...document.querySelectorAll("[data-length-sec]")];

export const customMinutesInput = document.querySelector("#custom-minutes");

export const applyCustomLengthButton = document.querySelector("#apply-custom-length");

export const sheet = document.querySelector("#course-sheet");

export const form = document.querySelector("#course-form");

export const formMessage = document.querySelector("#form-message");

export const deleteButton = document.querySelector("#delete-course");

export const deleteHint = document.querySelector("#delete-hint");

export const historyEmptyState = document.querySelector("#history-empty-state");

export const historyList = document.querySelector("#history-list");

export const sessionSummaryDialog = document.querySelector("#session-summary-dialog");

export const sessionSummaryForm = document.querySelector("#session-summary-form");

export const sessionSummaryInput = document.querySelector("#session-summary-input");

export const statsThisWeek = document.querySelector("#stats-this-week");

export const statsLastWeek = document.querySelector("#stats-last-week");

export const guideScrim = document.querySelector("#guide-scrim");

export const guideCard = document.querySelector("#guide-card");

export const settingsDialog = document.querySelector("#settings-dialog");

export const settingsGearButton = document.querySelector("#open-settings");

export const downloadFilingCard = document.querySelector("#download-filing-card");

export const downloadFilingSelect = document.querySelector("#download-filing-course");

export const downloadUndoCard = document.querySelector("#download-undo-card");

export const soundEffectsSetting = document.querySelector("#sound-effects-setting");

export const clickSound = new Audio("/sounds/click.ogg");

export const confirmSound = new Audio("/sounds/confirmation.ogg");

clickSound.volume = 0.16;

confirmSound.volume = 0.2;

export const haloCircumference = 2 * Math.PI * 96;

export const reducedMotionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

export const colorSchemePreference = window.matchMedia("(prefers-color-scheme: dark)");

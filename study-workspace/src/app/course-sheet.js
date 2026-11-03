import { appState } from "./state.js";
import { COURSE_COLORS, courseLinksText, parseCourseLinks, removeCourse, upsertCourse } from "../course-model.js";
import { open } from "@tauri-apps/plugin-dialog";
import { prepareCourseResources } from "../resource-model.js";
import { deleteButton, deleteHint, form, formMessage, sheet } from "./dom.js";
import { findCourse, render } from "./workspace.js";
import { persistNow, scheduleSave } from "./persistence.js";
import { createDialogController } from "./dialog.js";

let baselineCourseSnapshot = "";

function courseFormSnapshot() {
  if (!appState.editing) return "";
  return JSON.stringify({
    name: document.querySelector("#course-name").value.trim(),
    filingKeywords: document.querySelector("#course-filing-keywords").value,
    folder: document.querySelector("#course-folder").value.trim(),
    links: document.querySelector("#course-links").value,
    color: appState.editing.color,
    additionalFolders: appState.editing.additionalFolders,
    apps: appState.editing.apps,
    resourceGroups: appState.editing.resourceGroups,
    resourceAssignments: appState.editing.resourceAssignments,
  });
}

const courseDialogController = createDialogController({
  dialog: sheet,
  closeButton: document.querySelector("#close-sheet"),
  initialFocus: () => document.querySelector("#course-name"),
  fallbackFocus: () => document.querySelector("#add-course"),
  beforeClose: async () => {
    if (
      courseFormSnapshot() !== baselineCourseSnapshot &&
      !window.confirm("You have unsaved changes. Close this editor and save them?")
    ) return false;
    const saved = await persistNow();
    if (!saved) {
      showFormMessage("The course changes could not be saved.", "error");
      return false;
    }
    return true;
  },
  onClose: () => {
    appState.editing = null;
    baselineCourseSnapshot = "";
  },
});

export function openCourseSheet(course, isNew) {
  if (!appState.appData) return;
  appState.editing = { ...prepareCourseResources(structuredClone(course)), isNew };
  form.reset();
  document.querySelector("#course-name").value = appState.editing.name;
  document.querySelector("#course-filing-keywords").value = appState.editing.filingKeywords.join(", ");
  document.querySelector("#course-folder").value = appState.editing.folder;
  document.querySelector("#course-links").value = courseLinksText(appState.editing.links);
  document.querySelector("#sheet-title").textContent = appState.editing.name || "New course";
  renderCourseFiles();
  showFormMessage("");
  renderColorOptions();
  renderDeleteState();
  baselineCourseSnapshot = courseFormSnapshot();
  courseDialogController.open();
}

export async function chooseCourseFolder() {
  if (!appState.editing) return;
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

export async function chooseCourseFiles() {
  if (!appState.editing) return;
  try {
    const selected = await open({
      directory: false,
      multiple: true,
      title: "Add course files or apps",
    });
    if (selected === null) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    appState.editing.apps = [...new Set([...appState.editing.apps, ...paths])];
    renderCourseFiles();
    updateCourseFromForm();
  } catch (error) {
    console.error("Could not choose course files.", error);
    showFormMessage(`Could not choose files: ${String(error)}`, "error");
  }
}

export function renderCourseFiles() {
  const list = document.querySelector("#course-file-list");
  list.replaceChildren();

  for (const path of appState.editing?.apps ?? []) {
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

export function renderColorOptions() {
  const choices = document.querySelector("#color-options");
  choices.replaceChildren();

  for (const color of COURSE_COLORS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "color-choice";
    button.dataset.courseColor = color.value;
    button.style.setProperty("--swatch-color", color.value);
    button.setAttribute("aria-label", color.name);
    button.setAttribute("aria-pressed", String(appState.editing?.color === color.value));
    choices.append(button);
  }
}

export function renderDeleteState() {
  const course = appState.editing && findCourse(appState.editing.id);
  const canDelete = Boolean(course && appState.appData.courses.length > 1);
  deleteButton.disabled = !canDelete;
  deleteHint.textContent = course && !canDelete ? "Keep at least one course." : "";
}

export function updateCourseFromForm() {
  if (!appState.editing || !appState.appData) return;

  const name = document.querySelector("#course-name").value.trim();
  if (!name) {
    showFormMessage("Add a course name to save your changes.", "error");
    return;
  }

  try {
    const candidate = {
      id: appState.editing.id,
      name,
      color: appState.editing.color,
      folder: document.querySelector("#course-folder").value.trim(),
      additionalFolders: [...appState.editing.additionalFolders],
      links: parseCourseLinks(document.querySelector("#course-links").value),
      apps: [...appState.editing.apps],
      resourceGroups: [...appState.editing.resourceGroups],
      resourceAssignments: [...appState.editing.resourceAssignments],
      filingKeywords: document.querySelector("#course-filing-keywords").value
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean),
      notes: findCourse(appState.editing.id)?.notes ?? appState.editing.notes,
      createdAt: appState.editing.createdAt,
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

    appState.editing = candidate;
    appState.appData.courses = upsertCourse(appState.appData.courses, candidate);
    appState.selectedCourseId = candidate.id;
    document.querySelector("#sheet-title").textContent = candidate.name;
    showFormMessage("");
    render();
    renderDeleteState();
    scheduleSave();
  } catch (error) {
    showFormMessage(String(error), "error");
  }
}

export async function closeCourseSheet() {
  await courseDialogController.requestClose();
}

export function showFormMessage(message, state = "") {
  formMessage.textContent = message;
  if (state) {
    formMessage.dataset.state = state;
  } else {
    delete formMessage.dataset.state;
  }
}

export async function deleteSelectedCourse() {
  const course = findCourse(appState.editing?.id);
  if (!course || appState.appData.courses.length <= 1) return;
  if (!window.confirm(`Delete ${course.name}? This cannot be undone.`)) return;

  appState.appData.courses = removeCourse(appState.appData.courses, course.id);
  appState.appData.tasks = appState.appData.tasks.filter((task) => task.courseId !== course.id);
  appState.appData.notes = appState.appData.notes.filter((note) => note.courseId !== course.id);
  appState.selectedCourseId = appState.appData.courses[0].id;
  render();
  courseDialogController.close();
  await persistNow();
}

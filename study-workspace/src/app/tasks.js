import { appState } from "./state.js";
import { createStudyTask, nextTaskForCourse, tasksForCourse } from "../task-model.js";
import { applyDashboardComponents } from "./settings.js";
import { findCourse } from "./workspace.js";
import { newTaskTitleInput, nextTaskPreview, taskList, taskListEmpty } from "./dom.js";
import { scheduleSave } from "./persistence.js";

export function addCourseTask(event) {
  event.preventDefault();
  const course = findCourse(appState.selectedCourseId);
  if (!course || !appState.appData) return;
  const task = createStudyTask(course.id, newTaskTitleInput.value);
  if (!task) {
    newTaskTitleInput.focus();
    return;
  }
  appState.appData.tasks.push(task);
  newTaskTitleInput.value = "";
  renderTaskList();
  scheduleSave();
}

export function renderTaskList() {
  taskList.replaceChildren();
  const tasks = tasksForCourse(appState.appData?.tasks ?? [], appState.selectedCourseId);
  taskListEmpty.hidden = !findCourse(appState.selectedCourseId) || tasks.length > 0;
  const nextTask = nextTaskForCourse(appState.appData?.tasks ?? [], appState.selectedCourseId);
  nextTaskPreview.hidden = !nextTask;
  if (nextTask) {
    nextTaskPreview.textContent = `Next task: ${nextTask.title}`;
    nextTaskPreview.setAttribute(
      "aria-label",
      `Next task for ${findCourse(appState.selectedCourseId).name}: ${nextTask.title}. Open Tasks.`,
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

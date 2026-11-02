import { appState } from "./state.js";
import { createStudyTask, nextTaskForCourse, tasksForCourse } from "../task-model.js";
import { localDateInputToEnd } from "../date-model.js";
import { groupTasksByDue, taskReminder } from "../study/study-model.js";
import { applyDashboardComponents } from "./settings.js";
import { findCourse } from "./workspace.js";
import { newTaskDueDateInput, newTaskTitleInput, nextTaskPreview, taskList, taskListEmpty } from "./dom.js";
import { scheduleSave } from "./persistence.js";

export function addCourseTask(event) {
  event.preventDefault();
  const course = findCourse(appState.selectedCourseId);
  if (!course || !appState.appData) return;
  const dueAt = newTaskDueDateInput.value ? localDateInputToEnd(newTaskDueDateInput.value) : null;
  if (newTaskDueDateInput.value && !dueAt) {
    newTaskDueDateInput.focus();
    return;
  }
  const task = createStudyTask(course.id, newTaskTitleInput.value, undefined, undefined, dueAt);
  if (!task) {
    newTaskTitleInput.focus();
    return;
  }
  appState.appData.tasks.push(task);
  newTaskTitleInput.value = "";
  newTaskDueDateInput.value = "";
  renderTaskList();
  scheduleSave();
}

export function startTaskReminderRefresh() {
  if (appState.taskReminderTimer !== null) return;
  appState.taskReminderTimer = window.setInterval(() => {
    if (appState.activePage === "tasks") renderTaskList();
  }, 60_000);
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
  const groups = groupTasksByDue(tasks, new Date());
  const sections = [
    ["Overdue", groups.overdue],
    ["Today", groups.today],
    ["This week", groups.thisWeek],
    ["Later", groups.later],
    ["No date", groups.noDate],
    ["Completed", tasks.filter((task) => task.completed)],
  ];
  const showReminders = appState.appData?.settings.notifications !== false;
  for (const [label, groupedTasks] of sections) {
    if (groupedTasks.length === 0) continue;
    const group = document.createElement("li");
    group.className = "task-group";
    const heading = document.createElement("h2");
    heading.className = "task-group-heading";
    heading.textContent = label;
    const list = document.createElement("ul");
    list.className = "task-group-list";
    list.setAttribute("aria-label", `${label} tasks`);

    for (const task of groupedTasks) {
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

      const details = document.createElement("span");
      details.className = "task-details";
      if (task.dueAt) {
        const dueDate = document.createElement("time");
        dueDate.className = "task-due-date";
        dueDate.dateTime = task.dueAt;
        dueDate.textContent = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(task.dueAt));
        details.append(dueDate);
        const reminder = showReminders ? taskReminder(task, new Date()) : null;
        if (reminder) {
          const nudge = document.createElement("span");
          nudge.className = "task-reminder";
          nudge.dataset.kind = reminder.kind;
          nudge.textContent = reminder.label;
          details.append(nudge);
        }
      }

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "task-remove";
      remove.dataset.taskRemove = task.id;
      remove.setAttribute("aria-label", `Remove ${task.title}`);
      remove.textContent = "×";

      item.append(toggle, title, details, remove);
      list.append(item);
    }

    group.append(heading, list);
    taskList.append(group);
  }
  applyDashboardComponents();
}

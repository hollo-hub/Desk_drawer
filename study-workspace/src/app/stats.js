import { appState } from "./state.js";
import { longestStudyStreak, minutesByCourse } from "../stats-model.js";
import { statsLastWeek, statsThisWeek } from "./dom.js";

export function renderStats() {
  if (!appState.appData) return;
  document.querySelector("#stats-total-sessions").textContent = String(appState.appData.sessions.length);
  const streak = longestStudyStreak(appState.appData.sessions);
  document.querySelector("#stats-longest-streak").textContent = `${streak} day${streak === 1 ? "" : "s"}`;
  renderStatsBars(statsThisWeek, minutesByCourse(appState.appData.courses, appState.appData.sessions, 0));
  renderStatsBars(statsLastWeek, minutesByCourse(appState.appData.courses, appState.appData.sessions, 1));
}

export function renderStatsBars(list, rows) {
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

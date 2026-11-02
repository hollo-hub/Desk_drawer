import { appState } from "./state.js";
import { findCourse } from "./workspace.js";
import { historyEmptyState, historyList } from "./dom.js";

export function renderHistory() {
  historyList.replaceChildren();
  const sessions = [...(appState.appData?.sessions ?? [])]
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

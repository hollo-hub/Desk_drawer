import { appState } from "./state.js";
import { invoke } from "@tauri-apps/api/core";
import { saveStatus } from "./dom.js";
import { showFormMessage } from "./course-sheet.js";

export function scheduleSave(delay = 350) {
  window.clearTimeout(appState.saveTimer);
  appState.saveTimer = window.setTimeout(() => {
    void persistNow();
  }, delay);
}

export async function persistNow() {
  window.clearTimeout(appState.saveTimer);
  appState.saveTimer = null;
  if (!appState.appData) return false;

  const revision = ++appState.saveRevision;
  const snapshot = structuredClone(appState.appData);
  const write = appState.writeQueue
    .catch(() => undefined)
    .then(() => invoke("save_data", { data: snapshot }));
  appState.writeQueue = write;

  try {
    await write;
    if (revision === appState.saveRevision) {
      setSaveStatus("");
      if (appState.editing) showFormMessage("");
    }
    return true;
  } catch (error) {
    console.error("Could not save course changes.", error);
    if (revision === appState.saveRevision) {
      setSaveStatus(`Could not save changes: ${String(error)}`, "error");
      if (appState.editing) showFormMessage(`Could not save: ${String(error)}`, "error");
    }
    return false;
  }
}

export function setSaveStatus(message, state = "") {
  window.clearTimeout(appState.statusTimer);
  saveStatus.textContent = message;
  if (state) {
    saveStatus.dataset.state = state;
  } else {
    delete saveStatus.dataset.state;
  }
  if (message && state === "success") {
    appState.statusTimer = window.setTimeout(() => {
      saveStatus.textContent = "";
      delete saveStatus.dataset.state;
    }, 2600);
  }
}

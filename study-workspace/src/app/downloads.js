import { appState } from "./state.js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { downloadFilingCard, downloadFilingSelect, downloadUndoCard } from "./dom.js";
import { finishSession, sessionSummaryDialogController, startSelectedSession, toggleSessionPause } from "./session.js";
import { persistNow, setSaveStatus } from "./persistence.js";

export async function updateDownloadFilingSetting() {
  if (!appState.appData) return;
  const enabled = document.querySelector("#download-filing-setting").checked;
  appState.appData.settings.downloadFilingEnabled = enabled;
  if (!await persistNow()) return;
  try {
    await invoke("set_download_watching", { enabled });
    if (enabled) {
      setSaveStatus("Downloads filing is on. Add filename keywords to a course to receive suggestions.", "success");
    } else {
      appState.activeDownloadCandidate = null;
      appState.downloadCandidateQueue = [];
      downloadFilingCard.hidden = true;
      setSaveStatus("Downloads filing is off.", "success");
    }
  } catch (error) {
    appState.appData.settings.downloadFilingEnabled = !enabled;
    document.querySelector("#download-filing-setting").checked = !enabled;
    await persistNow();
    console.error("Could not update Downloads monitoring.", error);
    setSaveStatus(`Could not update Downloads monitoring: ${String(error)}`, "error");
  }
}

export async function setupDownloadFiling() {
  try {
    await listen("download-filing-candidate", ({ payload }) => {
      if (!appState.appData?.settings.downloadFilingEnabled || !payload?.path || !payload.matches?.length) return;
      if (
        appState.activeDownloadCandidate?.path === payload.path ||
        appState.downloadCandidateQueue.some((candidate) => candidate.path === payload.path)
      ) return;
      appState.downloadCandidateQueue.push(payload);
      showNextDownloadCandidate();
    });
  } catch (error) {
    console.error("Could not listen for Downloads filing suggestions.", error);
    setSaveStatus(`Downloads suggestions are unavailable: ${String(error)}`, "error");
    return;
  }
  if (appState.appData.settings.downloadFilingEnabled) {
    try {
      await invoke("set_download_watching", { enabled: true });
    } catch (error) {
      console.error("Could not start Downloads monitoring.", error);
      setSaveStatus(`Downloads filing could not start: ${String(error)}`, "error");
    }
  }
}

export async function setupTrayActions() {
  try {
    await listen("tray-action", ({ payload }) => {
      if (payload === "show") {
        void showMainWindow();
      } else if (payload === "start") {
        void showMainWindow().then(() => startSelectedSession());
      } else if (payload === "toggle") {
        void showMainWindow().then(() =>
          appState.activeSession ? toggleSessionPause() : startSelectedSession(),
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

export async function showMainWindow() {
  const currentWindow = getCurrentWindow();
  await currentWindow.show();
  await currentWindow.setFocus();
}

export async function quitFromTray() {
  appState.quitRequested = true;
  sessionSummaryDialogController.close();
  if (appState.activeSession) await finishSession(false);
  await appState.writeQueue;
  await invoke("quit_from_tray");
}

export function showNextDownloadCandidate() {
  if (appState.activeDownloadCandidate || appState.downloadCandidateQueue.length === 0) return;
  appState.activeDownloadCandidate = appState.downloadCandidateQueue.shift();
  document.querySelector("#download-filing-title").textContent =
    `Move ${appState.activeDownloadCandidate.filename} to a course?`;
  downloadFilingSelect.replaceChildren();
  for (const match of appState.activeDownloadCandidate.matches) {
    const option = document.createElement("option");
    option.value = match.courseId;
    option.textContent = match.courseName;
    downloadFilingSelect.append(option);
  }
  appState.activeDownloadCandidate.courseId = appState.activeDownloadCandidate.matches[0].courseId;
  downloadFilingCard.hidden = false;
}

export function dismissDownloadCandidate() {
  appState.activeDownloadCandidate = null;
  downloadFilingCard.hidden = true;
  showNextDownloadCandidate();
}

export async function moveSelectedDownload() {
  const candidate = appState.activeDownloadCandidate;
  if (!candidate) return;
  const moveButton = document.querySelector("#download-filing-move");
  moveButton.disabled = true;
  try {
    const receipt = await invoke("move_download_file", {
      courseId: candidate.courseId,
      path: candidate.path,
    });
    appState.activeDownloadCandidate = null;
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

export function showUndoReceipt(receipt) {
  window.clearTimeout(appState.undoExpirationTimer);
  appState.activeUndoId = receipt.id;
  const filename = receipt.to.split(/[\\/]/).at(-1) || "file";
  document.querySelector("#download-undo-message").textContent =
    `Filed ${filename}. You can undo this for 10 minutes.`;
  downloadUndoCard.hidden = false;
  appState.undoExpirationTimer = window.setTimeout(() => {
    if (appState.activeUndoId === receipt.id) {
      appState.activeUndoId = null;
      downloadUndoCard.hidden = true;
    }
  }, Math.max(0, receipt.undoUntil * 1000 - Date.now()));
}

export async function undoSelectedDownload() {
  if (!appState.activeUndoId) return;
  const id = appState.activeUndoId;
  try {
    await invoke("undo_download_move", { id });
    appState.activeUndoId = null;
    window.clearTimeout(appState.undoExpirationTimer);
    downloadUndoCard.hidden = true;
    setSaveStatus("File returned to Downloads.", "success");
  } catch (error) {
    console.error("Could not undo the file move.", error);
    setSaveStatus(`Could not undo the move: ${String(error)}`, "error");
  }
}

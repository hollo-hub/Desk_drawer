import { appState } from "./state.js";
import { createSessionRecord, elapsedMilliseconds, formatTimer, parseCustomMinutes, remainingMilliseconds, remainingSeconds, timerProgress } from "../timer-model.js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { launchMessage } from "../launch-message.js";
import { applyCustomLengthButton, buddyBubble, customMinutesInput, endSessionButton, haloCircumference, pauseSessionButton, sessionSummaryDialog, sessionSummaryInput, startSessionButton, timerDisplay, timerHalo, timerHaloProgress, timerLengthButtons } from "./dom.js";
import { findCourse, renderCourses } from "./workspace.js";
import { persistNow, scheduleSave, setSaveStatus } from "./persistence.js";
import { renderHistory } from "./history.js";
import { setBuddyState } from "./buddy.js";
import { createDialogController } from "./dialog.js";

export const sessionSummaryDialogController = createDialogController({
  dialog: sessionSummaryDialog,
  closeButton: document.querySelector("#close-session-summary"),
  initialFocus: sessionSummaryInput,
  fallbackFocus: startSessionButton,
});

export async function startSelectedSession() {
  const course = findCourse(appState.selectedCourseId);
  if (!course || appState.launchInProgress || appState.activeSession || appState.sessionFinishing) return;

  appState.launchInProgress = true;
  updateTimerControls();
  await persistNow();
  if (!findCourse(course.id)) {
    appState.launchInProgress = false;
    updateTimerControls();
    return;
  }

  const startedAt = Date.now();
  const sessionId = crypto.randomUUID();
  const countUp = appState.selectedTimerMode === "stopwatch";
  appState.activeSession = {
    id: sessionId,
    courseId: course.id,
    plannedSec: countUp ? 0 : appState.selectedLengthSec,
    countUp,
    startedAt: new Date(startedAt).toISOString(),
    startedAtMs: startedAt,
    deadlineMs: countUp ? null : startedAt + appState.selectedLengthSec * 1000,
    pausedRemainingMs: null,
    pausedElapsedMs: null,
  };
  void invoke("set_session_running", { running: true }).catch((error) => {
    console.error("Could not register the active session with the tray.", error);
    setSaveStatus(`Tray session state could not be updated: ${String(error)}`, "error");
  });
  setBuddyState("focus");
  buddyBubble.textContent = `Timer's running. I'll be here.`;
  delete buddyBubble.dataset.state;
  beginTimerUpdates();
  updateTimerControls();

  try {
    const report = await invoke("launch_course", { courseId: course.id });
    for (const failure of report.failures) {
      console.error(`Could not open course resource (${failure.kind}): ${failure.target}`, failure.reason);
    }
    if (appState.activeSession?.id === sessionId) {
      const message = launchMessage(report);
      const emptyCourse = !report.folderOpened && report.linksOpened === 0 && report.appsOpened === 0;
      buddyBubble.textContent =
        report.failures.length > 0 || emptyCourse
          ? `${message} Your timer is still running.`
          : message;
      buddyBubble.dataset.state = report.failures.length > 0 ? "error" : "success";
    }
  } catch (error) {
    console.error("Could not open course resources.", error);
    if (appState.activeSession?.id === sessionId) {
      buddyBubble.textContent = `Could not open ${course.name}. Check the folder and links in Edit. Your timer is still running.`;
      buddyBubble.dataset.state = "error";
    }
  } finally {
    appState.launchInProgress = false;
    updateTimerControls();
  }
}

export function setSessionLength(seconds, saveAsDefault) {
  if (appState.activeSession || appState.launchInProgress) {
    buddyBubble.textContent = "Wait for the session to start or finish it before changing its length.";
    return;
  }

  appState.selectedTimerMode = "countdown";
  appState.selectedLengthSec = seconds;
  timerDisplay.textContent = formatTimer(seconds);
  timerDisplay.setAttribute("aria-label", `Time remaining ${formatTimer(seconds)}`);
  appState.lastTimerSecond = seconds;
  updateLengthSelection();

  if (saveAsDefault && appState.appData && appState.appData.settings.defaultLengthSec !== seconds) {
    appState.appData.settings.defaultLengthSec = seconds;
    scheduleSave();
  }
}

export function selectStopwatchMode() {
  if (appState.activeSession || appState.launchInProgress) {
    buddyBubble.textContent = "Wait for the session to finish before changing its timer.";
    return;
  }

  appState.selectedTimerMode = "stopwatch";
  timerDisplay.textContent = "00:00";
  timerDisplay.setAttribute("aria-label", "Elapsed time 00:00");
  appState.lastTimerSecond = 0;
  updateLengthSelection();
}

export function applyCustomLength() {
  if (appState.activeSession || appState.launchInProgress) {
    buddyBubble.textContent = "Wait for the session to start or finish it before changing its length.";
    return;
  }

  const seconds = parseCustomMinutes(customMinutesInput.value);
  if (seconds === null) {
    buddyBubble.textContent = "Choose a whole number of minutes from 1 to 180.";
    customMinutesInput.focus();
    return;
  }
  setSessionLength(seconds, true);
  customMinutesInput.value = "";
}

export function updateLengthSelection() {
  const locked = Boolean(appState.activeSession || appState.launchInProgress);
  const stopwatchButton = document.querySelector("#stopwatch-mode");
  stopwatchButton.setAttribute("aria-pressed", String(appState.selectedTimerMode === "stopwatch"));
  stopwatchButton.disabled = locked;
  stopwatchButton.title = locked
    ? "Wait for the session to finish before changing its timer."
    : "Start at zero and count up.";
  for (const button of timerLengthButtons) {
    button.setAttribute(
      "aria-pressed",
      String(appState.selectedTimerMode === "countdown" && Number(button.dataset.lengthSec) === appState.selectedLengthSec),
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

export function updateTimerControls() {
  const course = findCourse(appState.selectedCourseId);
  const isPaused = appState.activeSession
    ? appState.activeSession.countUp
      ? appState.activeSession.pausedElapsedMs !== null
      : appState.activeSession.pausedRemainingMs !== null
    : false;
  startSessionButton.hidden = Boolean(appState.activeSession);
  pauseSessionButton.hidden = !appState.activeSession;
  endSessionButton.hidden = !appState.activeSession;
  startSessionButton.disabled = !course || !appState.appData || appState.launchInProgress || appState.sessionFinishing;
  pauseSessionButton.textContent = isPaused ? "Resume" : "Pause";
  pauseSessionButton.disabled = !appState.activeSession || appState.sessionFinishing;
  endSessionButton.disabled = !appState.activeSession || appState.sessionFinishing;
  document.querySelector("#add-course").disabled = !appState.appData;
  document.querySelector("#edit-course").disabled = !course;
  updateLengthSelection();
}

export function explainSessionLock() {
  buddyBubble.textContent = appState.launchInProgress && !appState.activeSession
    ? "Your session is starting. Wait a moment before changing courses or editing them."
    : "Finish or end this session before changing courses or editing them.";
}

export function beginTimerUpdates() {
  window.clearInterval(appState.timerInterval);
  appState.lastTimerSecond = null;
  updateTimerDisplay();
  appState.timerInterval = window.setInterval(updateTimerDisplay, 250);
}

export function updateTimerDisplay() {
  if (!appState.activeSession) return;
  const elapsedMs = appState.activeSession.countUp
    ? elapsedMilliseconds(appState.activeSession.startedAtMs, appState.activeSession.pausedElapsedMs)
    : null;
  const remainingMs = appState.activeSession.countUp
    ? null
    : remainingMilliseconds(appState.activeSession.deadlineMs, appState.activeSession.pausedRemainingMs);
  const seconds = appState.activeSession.countUp
    ? Math.floor(elapsedMs / 1000)
    : remainingSeconds(appState.activeSession.deadlineMs, appState.activeSession.pausedRemainingMs);
  const progress = appState.activeSession.countUp
    ? Math.max(0, 1 - elapsedMs / (Math.max(1, appState.selectedLengthSec) * 1000))
    : timerProgress(
        appState.activeSession.deadlineMs,
        appState.activeSession.plannedSec,
        appState.activeSession.pausedRemainingMs,
      );
  timerHalo.hidden = progress <= 0 || (!appState.activeSession.countUp && remainingMs <= 0);
  timerHaloProgress.style.strokeDashoffset = String(haloCircumference * (1 - progress));

  if (seconds !== appState.lastTimerSecond) {
    appState.lastTimerSecond = seconds;
    const text = formatTimer(seconds);
    timerDisplay.textContent = text;
    timerDisplay.setAttribute(
      "aria-label",
      `${appState.activeSession.countUp ? "Elapsed time" : "Time remaining"} ${text}`,
    );
    const course = findCourse(appState.activeSession.courseId);
    setNativeWindowTitle(
      appState.activeSession.countUp
        ? `Desk Drawer Study - ${appState.activeSession.pausedElapsedMs === null ? "" : "Paused "}${text} | ${course?.name ?? "Study session"}`
        : appState.activeSession.pausedRemainingMs === null
          ? `Desk Drawer Study - ${text} | ${course?.name ?? "Study session"}`
          : `Desk Drawer Study - Paused ${text} | ${course?.name ?? "Study session"}`,
    );
  }

  if (!appState.activeSession.countUp && remainingMs <= 0) {
    void finishSession(true);
  }
}

export function setNativeWindowTitle(title) {
  if (title === appState.lastWindowTitle) return;
  appState.lastWindowTitle = title;
  void getCurrentWindow()
    .setTitle(title)
    .catch((error) => console.error("Could not update the timer window title.", error));
}

export function toggleSessionPause() {
  if (!appState.activeSession || appState.sessionFinishing) return;

  if (appState.activeSession.countUp && appState.activeSession.pausedElapsedMs === null) {
    appState.activeSession.pausedElapsedMs = elapsedMilliseconds(
      appState.activeSession.startedAtMs,
      null,
    );
    const course = findCourse(appState.activeSession.courseId);
    setNativeWindowTitle(
      `Desk Drawer Study - Paused ${formatTimer(Math.floor(appState.activeSession.pausedElapsedMs / 1000))} | ${course?.name ?? "Study session"}`,
    );
    window.clearInterval(appState.timerInterval);
    appState.timerInterval = null;
    buddyBubble.textContent = "Paused.";
    setBuddyState("paused");
    delete buddyBubble.dataset.state;
    updateTimerDisplay();
    updateTimerControls();
    return;
  }

  if (!appState.activeSession.countUp && appState.activeSession.pausedRemainingMs === null) {
    appState.activeSession.pausedRemainingMs = remainingMilliseconds(
      appState.activeSession.deadlineMs,
      null,
    );
    const remaining = remainingSeconds(
      appState.activeSession.deadlineMs,
      appState.activeSession.pausedRemainingMs,
    );
    const course = findCourse(appState.activeSession.courseId);
    setNativeWindowTitle(
      `Desk Drawer Study - Paused ${formatTimer(remaining)} | ${course?.name ?? "Study session"}`,
    );
    window.clearInterval(appState.timerInterval);
    appState.timerInterval = null;
    buddyBubble.textContent = "Paused.";
    setBuddyState("paused");
    delete buddyBubble.dataset.state;
    updateTimerDisplay();
    updateTimerControls();
    return;
  }

  if (appState.activeSession.countUp) {
    appState.activeSession.startedAtMs = Date.now() - appState.activeSession.pausedElapsedMs;
    appState.activeSession.pausedElapsedMs = null;
  } else {
    appState.activeSession.deadlineMs = Date.now() + appState.activeSession.pausedRemainingMs;
    appState.activeSession.pausedRemainingMs = null;
  }
  buddyBubble.textContent = "Back to it.";
  setBuddyState("focus");
  delete buddyBubble.dataset.state;
  beginTimerUpdates();
  updateTimerControls();
}

export async function finishSession(completed) {
  if (!appState.activeSession || appState.sessionFinishing) return;
  appState.sessionFinishing = true;
  const session = appState.activeSession;
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

  appState.activeSession = null;
  void invoke("set_session_running", { running: false }).catch((error) => {
    console.error("Could not clear the active tray session.", error);
    setSaveStatus(`Tray session state could not be updated: ${String(error)}`, "error");
  });
  window.clearInterval(appState.timerInterval);
  appState.timerInterval = null;
  appState.sessionFinishing = false;
  timerHalo.hidden = true;
  const resetSeconds = session.countUp || didComplete ? 0 : appState.selectedLengthSec;
  timerDisplay.textContent = formatTimer(resetSeconds);
  timerDisplay.setAttribute(
    "aria-label",
    `${session.countUp ? "Elapsed time" : "Time remaining"} ${formatTimer(resetSeconds)}`,
  );
  appState.lastTimerSecond = resetSeconds;
  setNativeWindowTitle("Desk Drawer Study");

  if (record) {
    appState.appData.sessions.push(record);
    appState.latestSessionId = record.id;
    renderCourses();
    renderHistory();
    const loggedDuration =
      record.actualSec < 60
        ? `${record.actualSec} sec`
        : `${Math.floor(record.actualSec / 60)} min`;
    if (session.countUp) {
      buddyBubble.textContent = `Session ended. ${loggedDuration} logged.`;
    } else if (didComplete) {
      buddyBubble.textContent = `Nice work: ${sessionLengthLabel(record.plannedSec)} on ${findCourse(session.courseId)?.name ?? "your course"}.`;
    } else {
      buddyBubble.textContent = `Stopped early. ${loggedDuration} logged.`;
    }
    setBuddyState(didComplete ? "done" : "idle");
    window.clearTimeout(appState.doneStateTimer);
    if (didComplete) {
      appState.doneStateTimer = window.setTimeout(() => {
        if (!appState.activeSession) setBuddyState("idle");
      }, 4000);
    }
    await persistNow();
    if (appState.appData.settings.notifications) {
     void notifySessionEnd(findCourse(session.courseId)?.name ?? "your course");
    }
    sessionSummaryInput.value = "";
    if (!appState.quitRequested) sessionSummaryDialogController.open();
  } else {
    buddyBubble.textContent = "Stopped early. Under 5 seconds, so no session was logged.";
    setBuddyState("idle");
  }
  updateTimerControls();
  if (appState.launchInProgress) {
    buddyBubble.textContent += " Your course resources are still opening.";
  }
}

export function sessionLengthLabel(seconds) {
  return seconds < 60 ? `${seconds} sec` : `${Math.floor(seconds / 60)} min`;
}

export async function notifySessionEnd(courseName) {
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

export async function saveSessionSummary(event) {
  event.preventDefault();
  const summary = sessionSummaryInput.value.trim();
  const session = appState.appData?.sessions.find((item) => item.id === appState.latestSessionId);
  if (session && summary) {
    session.summary = summary;
    renderHistory();
    await persistNow();
  }
  sessionSummaryDialogController.close();
}

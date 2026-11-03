import { appState } from "./state.js";
import { daysSinceLastStudy } from "../course-model.js";
import { buddyPackRegistry } from "../buddy/registry.js";
import { buddyArt, buddyBubble, guideCard, reducedMotionPreference } from "./dom.js";

export const buddyIdleMessages = [
  "Ready when you are.",
  "One small step still counts.",
  "Your study kit is waiting.",
  "Let’s make a little progress.",
  "Take it one page at a time.",
  "You’ve got this.",
  "Curiosity looks good on you.",
  "Every session adds up.",
  "I’m right here when you need me.",
  "A quick start can change the whole day.",
];

export function updateReducedMotionPreference() {
  const stage = document.querySelector(".stage");
  stage.dataset.reducedMotion = String(reducedMotionPreference.matches);
  if (reducedMotionPreference.matches) {
    if (appState.currentBuddyState === "blink") {
      setBuddyState("idle");
    } else {
      window.clearTimeout(appState.buddyBlinkTimer);
      window.clearTimeout(appState.buddyBlinkResetTimer);
    }
    appState.buddyFrame = 0;
    renderBuddySprite();
  } else if (appState.currentBuddyState === "idle") {
    scheduleBuddyBlink();
  }
}

export function setBuddyState(state) {
  appState.currentBuddyState = state;
  document.querySelector(".stage").dataset.buddyState = state;
  appState.buddyFrame = 0;
  renderBuddySprite();
  window.clearTimeout(appState.buddyBlinkTimer);
  window.clearTimeout(appState.buddyBlinkResetTimer);
  if (state === "idle") scheduleBuddyBlink();
}

export function renderBuddySprite() {
  const pack = buddyPackRegistry.defaultPack;
  const frames = pack.frames[appState.currentBuddyState];
  if (!frames) throw new Error(`Buddy pack "${pack.id}" has no "${appState.currentBuddyState}" frames.`);
  buddyArt.style.setProperty("--buddy-rim", pack.palette.rim);
  buddyArt.style.setProperty("--buddy-backdrop", pack.palette.backdrop);
  buddyArt.innerHTML = frames[appState.buddyFrame % frames.length];
}

export function initializeBuddy() {
  renderBuddySprite();
  appState.buddyFrameTimer = window.setInterval(() => {
    if (reducedMotionPreference.matches) return;
    appState.buddyFrame = (appState.buddyFrame + 1) % 2;
    renderBuddySprite();
  }, 350);
  appState.buddyIdleMessageTimer = window.setInterval(() => {
    if (
      appState.currentBuddyState === "idle" &&
      !appState.activeSession &&
      appState.selectedCourseId &&
      appState.activePage === "desk" &&
      guideCard.hidden
    ) {
      showRandomBuddyLine();
    }
  }, 22000);
}

export function scheduleBuddyBlink() {
  if (reducedMotionPreference.matches || !buddyArt) return;
  appState.buddyBlinkTimer = window.setTimeout(() => {
    if (appState.currentBuddyState !== "idle") return;
    setBuddyState("blink");
    appState.buddyBlinkResetTimer = window.setTimeout(() => setBuddyState("idle"), 140);
  }, 3600);
}

export function showRandomBuddyLine() {
  if (!appState.selectedCourseId || appState.currentBuddyState !== "idle") return;
  if (appState.idleMessageBag.length === 0) {
    appState.idleMessageBag = [...buddyIdleMessages];
    for (let index = appState.idleMessageBag.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [appState.idleMessageBag[index], appState.idleMessageBag[swapIndex]] = [
        appState.idleMessageBag[swapIndex],
        appState.idleMessageBag[index],
      ];
    }
    if (appState.idleMessageBag.at(-1) === appState.lastIdleMessage) {
      [appState.idleMessageBag[0], appState.idleMessageBag[appState.idleMessageBag.length - 1]] = [
        appState.idleMessageBag.at(-1),
        appState.idleMessageBag[0],
      ];
    }
  }
  appState.lastIdleMessage = appState.idleMessageBag.pop();
  buddyBubble.textContent = appState.lastIdleMessage;
}

export function showCourseNudge() {
  if (appState.nudgeShown || appState.activeSession || !appState.appData?.courses.length) return;
  const neglected = appState.appData.courses
    .map((course) => ({ course, days: daysSinceLastStudy(course, appState.appData.sessions) }))
    .find(({ days }) => days !== null && days >= 4);
  if (!neglected) return;
  appState.nudgeShown = true;
  buddyBubble.textContent = `It's been ${neglected.days} days since ${neglected.course.name}.`;
  setBuddyState("nudge");
}

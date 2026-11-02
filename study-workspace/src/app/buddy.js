import { appState } from "./state.js";
import { daysSinceLastStudy } from "../course-model.js";
import { sprite } from "../buddy/ghost-sprite.js";
import { buddyArt, catBubble, guideCard, reducedMotionPreference } from "./dom.js";
import { findCourse } from "./workspace.js";

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
      setCatState("idle");
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

export function setCatState(state) {
  appState.currentBuddyState = state;
  document.querySelector(".stage").dataset.catState = state;
  appState.buddyFrame = 0;
  renderBuddySprite();
  window.clearTimeout(appState.buddyBlinkTimer);
  window.clearTimeout(appState.buddyBlinkResetTimer);
  if (state === "idle") scheduleBuddyBlink();
}

export function buddyCoat() {
  const color = findCourse(appState.selectedCourseId)?.color?.toLowerCase();
  if (color === "#5fb3a8") return "mint";
  if (color === "#dc8299") return "coral";
  if (color === "#e2b25c") return "sunny";
  return "lavender";
}

export function renderBuddySprite() {
  buddyArt.innerHTML = sprite(appState.currentBuddyState, appState.buddyFrame, buddyCoat());
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
    setCatState("blink");
    appState.buddyBlinkResetTimer = window.setTimeout(() => setCatState("idle"), 140);
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
  catBubble.textContent = appState.lastIdleMessage;
}

export function showCourseNudge() {
  if (appState.nudgeShown || appState.activeSession || !appState.appData?.courses.length) return;
  const neglected = appState.appData.courses
    .map((course) => ({ course, days: daysSinceLastStudy(course, appState.appData.sessions) }))
    .find(({ days }) => days !== null && days >= 4);
  if (!neglected) return;
  appState.nudgeShown = true;
  catBubble.textContent = `It's been ${neglected.days} days since ${neglected.course.name}.`;
  setCatState("nudge");
}

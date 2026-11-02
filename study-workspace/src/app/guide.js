import { appState } from "./state.js";
import { guideCard, guideScrim } from "./dom.js";
import { scheduleSave } from "./persistence.js";

export function openGuide() {
  if (!guideCard.hidden || appState.appData?.settings.tourDone) return;
  appState.guideSteps = createGuideSteps();
  appState.guideStep = 0;
  guideScrim.hidden = false;
  guideCard.hidden = false;
  renderGuideStep();
  document.querySelector("#guide-next").focus();
}

export function createGuideSteps() {
  const hasCourses = Boolean(appState.appData?.courses.length);
  const steps = [
    {
      id: "welcome",
      title: "Welcome to Desk Drawer Study",
      copy: "Your study space starts empty. This quick tour will point out the real controls; you can use them while the guide is open.",
      target: null,
    },
    {
      id: "course",
      title: hasCourses ? "Choose a course" : "Create your first course",
      copy: hasCourses
        ? "Your courses live here. Select one to bring its timer, notes, tasks, and resources into view."
        : "Start with a course. Add only the folders, links, notes, and tasks you need; nothing is pre-filled.",
      target: hasCourses ? "#course-list" : "#add-course",
    },
  ];
  if (hasCourses) {
    steps.push(
      {
        id: "timer",
        title: "Choose how to focus",
        copy: "The Stopwatch starts at 0:00 and counts up. Or choose a countdown length.",
        target: "#timer-lengths",
      },
      {
        id: "start",
        title: "Start your study session",
        copy: "Start opens the selected course resources and begins tracking your session.",
        target: "#start-session",
      },
    );
  }
  steps.push(
    {
      id: "workspace",
      title: "Keep your study tools close",
      copy: "Open Resources, Notes, Tasks, Stats, and History from the navigation.",
      target: '[data-page-target="resources"]',
    },
    {
      id: "settings",
      title: "Make it yours",
      copy: "Change appearance, session notifications, sounds, and the items shown on your desk here.",
      target: "#open-settings",
    },
  );
  return steps;
}

export function refreshGuideSteps() {
  const currentId = appState.guideSteps[appState.guideStep]?.id;
  appState.guideSteps = createGuideSteps();
  const updatedIndex = appState.guideSteps.findIndex((step) => step.id === currentId);
  appState.guideStep = updatedIndex < 0 ? 0 : updatedIndex;
  renderGuideStep();
}

export function renderGuideStep() {
  const step = appState.guideSteps[appState.guideStep];
  clearGuideTarget();
  document.querySelector("#guide-step-label").textContent = `Step ${appState.guideStep + 1} of ${appState.guideSteps.length}`;
  document.querySelector("#guide-heading").textContent = step.title;
  document.querySelector("#guide-copy").textContent = step.copy;
  document.querySelector("#guide-next").textContent = appState.guideStep === appState.guideSteps.length - 1 ? "Finish" : "Next";
  const progress = document.querySelector("#guide-progress");
  progress.replaceChildren();
  appState.guideSteps.forEach((_, index) => {
    const dot = document.createElement("span");
    dot.dataset.active = String(index === appState.guideStep);
    progress.append(dot);
  });
  if (step.target) {
    const target = document.querySelector(step.target);
    target?.classList.add("guide-target");
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  requestAnimationFrame(positionGuideCard);
}

export function clearGuideTarget() {
  document.querySelectorAll(".guide-target").forEach((element) => element.classList.remove("guide-target"));
}

export function positionGuideCard() {
  if (guideCard.hidden) return;
  const target = document.querySelector(".guide-target");
  const rect = target?.getBoundingClientRect();
  const cardRect = guideCard.getBoundingClientRect();
  const margin = 18;
  let top = Math.max(margin, (window.innerHeight - cardRect.height) / 2);
  let left = (window.innerWidth - cardRect.width) / 2;
  if (rect && rect.width && rect.height) {
    top = rect.bottom + cardRect.height + margin < window.innerHeight
      ? rect.bottom + margin
      : Math.max(margin, rect.top - cardRect.height - margin);
    left = Math.min(
      window.innerWidth - cardRect.width - margin,
      Math.max(margin, rect.left + rect.width / 2 - cardRect.width / 2),
    );
  }
  guideCard.style.top = `${top}px`;
  guideCard.style.left = `${left}px`;
}

export function advanceGuide() {
  if (appState.guideStep === appState.guideSteps.length - 1) {
    closeGuide();
    return;
  }
  appState.guideStep += 1;
  renderGuideStep();
}

export function closeGuide() {
  clearGuideTarget();
  guideCard.hidden = true;
  guideScrim.hidden = true;
  guideCard.style.removeProperty("top");
  guideCard.style.removeProperty("left");
  if (appState.appData && !appState.appData.settings.tourDone) {
    appState.appData.settings.tourDone = true;
    scheduleSave();
  }
}

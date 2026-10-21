import { isTauri } from '@tauri-apps/api/core';
import {
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import {
  FocusSession,
  isValidFocusDuration,
} from '../core/focus-timer.js';
import { Cat, clearSpriteCache } from './cat.js';
import {
  Backdrop,
  clearIconCache,
  Cursor,
  DEFAULT_FAVORITES,
  drawHalo,
  drawPillars,
  drawStage,
  Orbit,
} from './stage.js';
import { THEMES } from './themes.js';
import { computeCatLayout } from './layout.js';
import { resolveHomeThemeId } from './theme-adapter.js';
import {
  DEFAULTS,
  loadSettings,
  saveFocusSettings as persistFocusSettings,
  saveSettings,
} from './settings.js';
import { closePanel, hasPanel, notice, openPanel } from './panels.js';
import './home.css';

const home = document.getElementById('v2Home');
const canvas = document.getElementById('v2Stage');
const openClassicButton = document.getElementById('v2OpenClassic');
const returnHomeButton = document.getElementById('v2ReturnHome');
const toggleToolsButton = document.getElementById('v2ToggleTools');
const toolButtons = document.getElementById('v2ToolButtons');
const commandPalette = document.getElementById('commandPalette');
const context = canvas?.getContext('2d');

if (!(home instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)
  || !(openClassicButton instanceof HTMLButtonElement)
  || !(returnHomeButton instanceof HTMLButtonElement)
  || !(toggleToolsButton instanceof HTMLButtonElement)
  || !(toolButtons instanceof HTMLElement)
  || !(commandPalette instanceof HTMLDialogElement) || !context) {
  throw new Error('The cat home view could not start because its page elements are missing.');
}

const cat = new Cat();
const cursor = new Cursor();
const focusSession = new FocusSession();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let themeId = 'night';
let theme = THEMES[themeId];
let settings = { ...DEFAULTS, favorites: DEFAULTS.favorites.slice() };
let width = 0;
let height = 0;
let pixelRatio = 1;
let layout;
let backdrop;
let orbit = new Orbit(DEFAULT_FAVORITES);
let elapsed = 0;
let previousFrame = 0;
let animationFrame = 0;
let running = false;
let lastInput = performance.now();
let pointerX = 0;
let pointerY = 0;
let pointerInside = false;
let focusTicker = 0;
let focusNotificationPermission = Promise.resolve(false);
let happyUntil = 0;
let hopAfterYawn = 0;

const TOOL_LABELS = Object.freeze({
  scenes: 'Scenes',
  focus: 'Focus',
  clipboard: 'Clipboard',
  links: 'Links',
  notes: 'Notes',
  tidy: 'Tidy downloads',
  rename: 'Rename files',
  layouts: 'Window layouts',
  picker: 'Color picker',
  awake: 'Keep awake',
  pin: 'Pin window',
  buddy: 'Buddy',
});

const CLASSIC_PANEL_IDS = Object.freeze({
  scenes: 'scenes',
  focus: 'focus',
  clipboard: 'clip',
  links: 'links',
  notes: 'notes',
  tidy: 'tidy',
  rename: 'ren',
  layouts: 'lay',
  picker: 'color',
  awake: 'awake',
  pin: 'pin',
  settings: 'settings',
});

const api = {
  get settings() { return settings; },
  get focus() { return focusSession.state; },
  get haloColor() { return settings.haloColor || theme.halo; },
  async set(patch) {
    const next = { ...settings, ...patch };
    const result = await saveSettings(next);
    if (!result.ok) {
      fail(result.message);
      return false;
    }
    settings = next;
    if ('favorites' in patch) {
      buildOrbit();
      renderAccessibleTools();
    }
    render();
    return true;
  },
  async saveFocusSettings(patch) {
    const focus = { ...settings.focus, ...patch };
    const result = await persistFocusSettings(focus);
    if (!result.ok) {
      fail(result.message);
      return false;
    }
    settings = { ...settings, focus };
    return true;
  },
  requestFocusNotifications: requestFocusNotificationPermission,
  startFocus,
  stopFocus,
  celebrate() {
    happyUntil = elapsed + 2;
    cat.hop(1);
  },
  openClassic: showClassic,
  openPanel: openHomePanel,
  toggleTools,
  fail,
};

function customThemeFromTokens(id) {
  const root = document.documentElement;
  const styles = getComputedStyle(root);
  const token = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  const background = token('--bg', THEMES.night.sky[0]);
  const customTheme = {
    ...THEMES.night,
    name: id,
    sky: [background, background],
    stage: {
      top: token('--desk', THEMES.night.stage.top),
      left: token('--desk-edge', THEMES.night.stage.left),
      right: token('--desk-edge', THEMES.night.stage.right),
      rug: token('--surface', THEMES.night.stage.rug),
    },
    glass: {
      fill: token('--surface', THEMES.night.glass.fill),
      stroke: token('--edge', THEMES.night.glass.stroke),
    },
    text: token('--ink', THEMES.night.text),
    textDim: token('--muted', THEMES.night.textDim),
    accent: token('--accent', THEMES.night.accent),
    accent2: token('--focus-ring', THEMES.night.accent2),
    halo: token('--accent', THEMES.night.halo),
    bg: { mode: 'none', colors: [] },
    font: token('--font', THEMES.night.font),
    radius: Number.parseFloat(token('--theme-radius', '14px')) || 0,
    border: Number.parseFloat(token('--theme-border-width', '1px')) || 1,
    cat: {},
  };
  if (id === 'transparent') customTheme.sky = [null, null];
  return customTheme;
}

function applyHomeTheme(classicThemeId) {
  themeId = resolveHomeThemeId(classicThemeId);
  if (!THEMES[themeId]) THEMES[themeId] = customThemeFromTokens(themeId);
  theme = THEMES[themeId];
  home.style.setProperty('--v2-text', theme.text);
  home.style.setProperty('--v2-font', theme.font);
  home.style.setProperty('--v2-stroke', theme.glass.stroke);
  home.style.setProperty('--v2-glass', theme.glass.fill);
  home.style.setProperty('--v2-accent', theme.accent);
  home.classList.toggle('custom-cursor', settings.customCursor !== false);
  clearSpriteCache();
  clearIconCache();
  render();
}

function fail(message) {
  notice(message);
  cat.surprise();
}

function dispatchFocusEvent(name, detail = {}) {
  document.dispatchEvent(new CustomEvent(`desk-drawer:${name}`, { detail }));
}

function requestFocusNotificationPermission() {
  if (isTauri()) {
    return requestPermission().then((permission) => {
      if (permission !== 'granted') console.warn('Focus completion notification permission was not granted.');
      return permission === 'granted';
    }).catch((error) => {
      console.warn('Focus completion notification permission could not be requested', error);
      return false;
    });
  }
  if (typeof Notification === 'undefined') {
    console.warn('Focus completion notifications are unavailable in this browser.');
    return Promise.resolve(false);
  }
  if (Notification.permission === 'granted') return Promise.resolve(true);
  if (Notification.permission === 'denied') {
    console.warn('Focus completion notification permission was denied.');
    return Promise.resolve(false);
  }
  return Notification.requestPermission().then((permission) => {
    if (permission !== 'granted') console.warn('Focus completion notification permission was not granted.');
    return permission === 'granted';
  }).catch((error) => {
    console.warn('Focus completion notification permission could not be requested', error);
    return false;
  });
}

async function notifyFocusComplete() {
  if (!await focusNotificationPermission) return;
  try {
    const notification = {
      title: 'Focus complete',
      body: 'Time for a break.',
    };
    if (isTauri()) await sendNotification(notification);
    else new Notification(notification.title, { body: notification.body });
  } catch (error) {
    console.warn('Focus completion notification was not shown', error);
  }
}

function completeFocus() {
  if (!focusSession.tick()) return;
  window.clearInterval(focusTicker);
  focusTicker = 0;
  const { totalSeconds, breakReminder } = focusSession.state;
  if (breakReminder) {
    cat.yawn();
    if (isReducedMotion()) {
      happyUntil = elapsed + 5;
      cat.hop(1);
    } else {
      if (hopAfterYawn) window.clearTimeout(hopAfterYawn);
      hopAfterYawn = window.setTimeout(() => {
        hopAfterYawn = 0;
        happyUntil = elapsed + 5;
        cat.hop(1);
        render();
      }, 1250);
    }
    void notifyFocusComplete();
  }
  dispatchFocusEvent('focus.finished', { completed: true });
  document.dispatchEvent(new CustomEvent('focus:done', {
    detail: { minutes: totalSeconds / 60 },
  }));
  if (breakReminder) dispatchFocusEvent('break.requested', { source: 'focus-timer' });
  dispatchFocusEvent('tool.used', { id: 'focus', action: 'completed' });
  render();
}

function startFocus(minutes, breakReminder, permission = null) {
  if (!isValidFocusDuration(minutes)) {
    fail('Choose a whole focus duration from 1 minute to 7 days.');
    return false;
  }
  if (focusSession.state.running) return false;
  focusSession.start(minutes, breakReminder);
  focusNotificationPermission = breakReminder
    ? permission || requestFocusNotificationPermission()
    : Promise.resolve(false);
  focusTicker = window.setInterval(completeFocus, 250);
  dispatchFocusEvent('focus.started', { minutes });
  dispatchFocusEvent('tool.used', { id: 'focus', action: 'started' });
  render();
  return true;
}

function stopFocus() {
  if (!focusSession.stop()) return false;
  window.clearInterval(focusTicker);
  focusTicker = 0;
  dispatchFocusEvent('focus.finished', { completed: false });
  render();
  return true;
}

function isReducedMotion() {
  return reducedMotion.matches || settings.motion === 'reduced';
}

function buildOrbit() {
  const items = settings.favorites
    .filter((id) => TOOL_LABELS[id])
    .map((id) => ({ id, label: TOOL_LABELS[id], icon: id }));
  const wasOpen = orbit.open;
  orbit = new Orbit(items);
  if (wasOpen) {
    orbit.open = true;
    orbit.items.forEach((item) => { item.t = 1; });
  }
  syncToolsToggle();
}

function renderAccessibleTools() {
  toolButtons.replaceChildren();
  for (const item of orbit.items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.label;
    button.setAttribute('aria-label', item.label);
    button.addEventListener('click', () => openHomePanel(item.id));
    toolButtons.append(button);
  }
}

function syncToolsToggle() {
  toggleToolsButton.textContent = orbit.open ? 'Hide tools' : 'Show tools';
  toggleToolsButton.setAttribute('aria-label', toggleToolsButton.textContent);
  toggleToolsButton.setAttribute('aria-expanded', String(orbit.open));
}

function toggleTools() {
  orbit.toggle();
  cat.hop(0.8);
  syncToolsToggle();
}

function showClassic(panelId) {
  closePanel();
  stop();
  home.hidden = true;
  returnHomeButton.hidden = false;
  document.body.dataset.appView = 'classic';

  if (!panelId) return;
  requestAnimationFrame(() => {
    const tab = document.querySelector(`#moduleTabs .drawer[data-p="${panelId}"]`);
    if (tab instanceof HTMLButtonElement) {
      tab.click();
      return;
    }

    const modulesTab = document.querySelector('#moduleTabs .drawer[data-p="modules"]');
    if (modulesTab instanceof HTMLButtonElement) modulesTab.click();
    const status = document.getElementById('hotkeyWarning');
    if (panelId && status) {
      status.textContent = 'That tool is turned off. Enable it from Modules, then return to the cat.';
      status.hidden = false;
    }
  });
}

function openHomePanel(id) {
  if (hasPanel(id)) {
    openPanel(id, api);
    return;
  }
  const panelId = CLASSIC_PANEL_IDS[id];
  if (!panelId) {
    fail('That tool is not available from the home view.');
    return;
  }
  showClassic(panelId);
}

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.imageSmoothingEnabled = false;
  layout = computeCatLayout(width, height);
  backdrop = new Backdrop(width, height);
  render();
}

function draw(nowSeconds) {
  backdrop.draw(
    context,
    theme,
    nowSeconds,
    pointerInside ? (pointerX - layout.centerX) / (width / 2) : 0,
    pointerInside ? (layout.centerY - pointerY) / (height / 2) : 0,
    isReducedMotion(),
  );
  drawPillars(context, width, height, theme, nowSeconds, isReducedMotion());
  drawStage(context, layout.centerX, layout.stageCenterY, layout.stageWidth, theme);
  orbit.draw(context, theme, themeId, 'back');
  cat.draw(context, themeId, layout.catX, layout.catY, layout.scale);
  const focus = focusSession.state;
  drawHalo(
    context,
    layout.centerX,
    layout.catY - 2 * layout.scale + cat.hopOffset() * layout.scale,
    13 * layout.scale,
    3 * layout.scale,
    focus.running ? focus.fraction : 1,
    api.haloColor,
    nowSeconds,
    Math.max(2, layout.scale),
    isReducedMotion(),
  );
  orbit.draw(context, theme, themeId, 'front');
  if (settings.customCursor) {
    cursor.draw(context, orbit.hover >= 0 ? theme.accent2 : api.haloColor, orbit.hover >= 0);
  }
}

function render() {
  if (layout && backdrop) draw(elapsed);
}

function frame(now) {
  if (!running || document.hidden || home.hidden) {
    animationFrame = 0;
    return;
  }
  const delta = previousFrame ? Math.min((now - previousFrame) / 1000, 0.05) : 0;
  previousFrame = now;
  elapsed += delta;
  const idleSeconds = (performance.now() - lastInput) / 1000;
  const focus = focusSession.state;
  cat.setMood(focus.running ? 'focus' : elapsed < happyUntil ? 'happy' : idleSeconds > 600 ? 'sleep' : 'idle');
  cat.setLook(
    pointerInside ? (pointerX - layout.centerX) / (width / 2) : 0,
    pointerInside ? (layout.centerY - pointerY) / (height / 2) : 0,
    pointerInside && !focus.running,
  );
  cat.update(delta, isReducedMotion());
  orbit.update(
    delta,
    layout.centerX,
    layout.catY - 2 * layout.scale + cat.hopOffset() * layout.scale,
    layout.centerX,
    layout.centerY,
    layout.scale,
    isReducedMotion(),
  );
  cursor.update(delta);
  render();
  animationFrame = window.requestAnimationFrame(frame);
}

function start() {
  if (running || document.hidden || home.hidden) return;
  running = true;
  previousFrame = 0;
  animationFrame = window.requestAnimationFrame(frame);
}

function stop() {
  running = false;
  previousFrame = 0;
  if (animationFrame) window.cancelAnimationFrame(animationFrame);
  animationFrame = 0;
}

function pointerMove(event) {
  const bounds = canvas.getBoundingClientRect();
  pointerX = event.clientX - bounds.left;
  pointerY = event.clientY - bounds.top;
  pointerInside = true;
  lastInput = performance.now();
  orbit.hover = orbit.hit(pointerX, pointerY);
  if (settings.customCursor !== false) {
    cursor.move(pointerX, pointerY, api.haloColor, isReducedMotion());
  }
}

canvas.addEventListener('pointermove', pointerMove);
canvas.addEventListener('pointerleave', () => {
  pointerInside = false;
  cursor.leave();
  orbit.hover = -1;
});
canvas.addEventListener('pointerdown', (event) => {
  pointerMove(event);
  const toolIndex = orbit.hit(pointerX, pointerY);
  if (toolIndex >= 0) {
    const item = orbit.items[toolIndex];
    item.pulse = 1;
    if (settings.customCursor !== false) {
      cursor.burst(pointerX, pointerY, api.haloColor, isReducedMotion());
    }
    openHomePanel(item.id);
    return;
  }
  const insideCat = pointerX >= layout.catX && pointerX <= layout.catX + layout.catWidth
    && pointerY >= layout.catY && pointerY <= layout.catY + layout.catWidth;
  if (insideCat) {
    toggleTools();
    cat.hop(1);
  } else {
    cat.hop(0.4);
    if (settings.customCursor !== false) {
      cursor.burst(pointerX, pointerY, api.haloColor, isReducedMotion());
    }
  }
});
canvas.addEventListener('contextmenu', (event) => {
  const bounds = canvas.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  const insideCat = x >= layout.catX && x <= layout.catX + layout.catWidth
    && y >= layout.catY && y <= layout.catY + layout.catWidth;
  if (insideCat) {
    event.preventDefault();
    openHomePanel('buddy');
  }
});
document.addEventListener('desk-drawer-theme-changed', (event) => {
  applyHomeTheme(event.detail?.themeId ?? document.documentElement.dataset.theme);
});
document.addEventListener('keydown', (event) => {
  lastInput = performance.now();
  if (event.key === 'Escape') closePanel();
});
openClassicButton.addEventListener('click', () => {
  showClassic();
});
returnHomeButton.addEventListener('click', () => {
  closePanel();
  returnHomeButton.hidden = true;
  home.hidden = false;
  document.body.dataset.appView = 'v2-home';
  start();
});
toggleToolsButton.addEventListener('click', toggleTools);
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
  else start();
});
reducedMotion.addEventListener('change', render);

document.body.dataset.appView = 'v2-home';
home.hidden = false;
document.body.append(commandPalette);
loadSettings().then((loaded) => {
  settings = loaded.settings;
  applyHomeTheme(document.documentElement.dataset.theme || settings.theme || 'night');
  buildOrbit();
  renderAccessibleTools();
  if (loaded.warning) fail(loaded.warning);
}).catch((error) => {
  console.error('V2 home startup failed', error);
  fail('The cat home could not load its saved settings.');
});
applyHomeTheme(document.documentElement.dataset.theme || 'night');
resize();
start();

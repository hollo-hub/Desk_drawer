import './style.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { open, save } from '@tauri-apps/plugin-dialog';
import { createEventBus } from './core/event-bus.js';
import { ModuleRegistry } from './core/module-registry.js';
import { loadSettings, setModuleEnabled } from './core/settings.js';
import {
  createDefaultDeskPack,
  validateDeskPack,
  validateInstalledDeskPackAssets,
} from './core/desk-pack.js';
import {
  createPlaceholderSpriteSheet,
  drawSpriteFrame,
  resolvePackAnimationFrame,
  spriteFrameRectangle,
  SPRITE_FRAME_NAMES,
} from './core/sprite-sheet.js';
import { createBehaviorEngine } from './core/behavior-engine.js';
import { createMotionEngine, createSpring } from './core/motion.js';
import { applyMotionCssTokens } from './core/motion-tokens.js';
import {
  DEFAULT_ANIMATION_SETTINGS,
  normalizeAnimationSettings,
  sampleSpringCurve,
} from './core/animation-settings.js';
import { BUDDY_STATES } from './core/buddy-state.js';
import { createParticlePool } from './core/particle-effects.js';
import {
  cursorTiltFromPoint,
  DEFAULT_INTERFACE_MOTION,
  dockMagnification,
  normalizeInterfaceMotion,
  optionalMotionAllowed,
} from './core/interface-motion.js';
import { SETTINGS_CATALOG, SETTINGS_SECTIONS, searchSettings } from './core/settings-search.js';
import { filterInspectorEvents, summarizeInspectorPayload } from './core/developer-tools.js';
import { checkThemeContrast, fixThemeTextContrast } from './core/theme-contrast.js';
import { applyThemeTokens, resolveThemeTokens } from './core/theme-tokens.js';
import { DEFAULT_THEME_PREFERENCES, migrateThemePreferences, resolveScheduledTheme } from './core/theme-preferences.js';
import { themePaletteEntries } from './home-v2/theme-adapter.js';
import { loadBuiltinThemes } from './themes/index.js';
import { parseThemeColor, parseThemeFile, serializeThemeFile, validateTheme } from './core/theme.js';
import { getCurrentWindow, UserAttentionType } from '@tauri-apps/api/window';
import clipboard from './modules/clipboard/module.json';
import links from './modules/links/module.json';
import layouts from './modules/layouts/module.json';
import rename from './modules/rename/module.json';
import breakBuddy from './modules/break/module.json';
import colorPicker from './modules/color-picker/module.json';
import keepAwake from './modules/keep-awake/module.json';
import pinWindow from './modules/pin-window/module.json';
import notes from './modules/notes/module.json';
import focus from './modules/focus/module.json';
import tidyDownloads from './modules/tidy-downloads/module.json';
import scenes from './modules/scenes/module.json';
import sleepyCatPack from '../packs/sleepy-cat/pack.json';
import curiousFoxPack from '../packs/curious-fox/pack.json';

const $ = (selector) => document.querySelector(selector);
const root = document.documentElement;
root.dataset.documentVisible = String(document.visibilityState !== 'hidden');
const eventBus = createEventBus();
for (const name of ['focus.started', 'focus.finished', 'break.requested', 'tool.used']) {
  document.addEventListener(`desk-drawer:${name}`, (event) => {
    eventBus.emit(name, event.detail ?? {});
  });
}
const motionEngine = createMotionEngine({ documentRef: document });
const mainWindow = getCurrentWindow();
const builtinThemes = loadBuiltinThemes();
const builtinThemeIds = new Set(builtinThemes.map((theme) => theme.meta.id));
let userThemes = [];
let themePreferences = { ...DEFAULT_THEME_PREFERENCES, opacityOverrides: {}, customThemes: [] };
let savedThemePreferences = structuredClone(themePreferences);
let currentThemeObject = builtinThemes[0];
let resolvedThemeTokens = {};
let activeThemeId = 'night';
let toastTimer;
let animationsEnabled = true;
let animationSettings = normalizeAnimationSettings();
let interfaceMotion = { ...DEFAULT_INTERFACE_MOTION };
let interfaceMotionReady = false;
let drawerNudgeTimer;
const rubberBandAnimations = new Map();
const listExitAnimations = new Map();
const deskItemAnimations = new WeakMap();
let nextListExitAnimation = 0;
let nextDeskItemAnimation = 0;
let particlePool = null;
const pendingStickerUnlocks = new Set();
let buddyMotionMetadata = null;
eventBus.on('buddy.motion.metadata', ({ motion }) => {
  buddyMotionMetadata = motion ?? null;
});

let windowStyle = 'native';
let cancelWindowTransition = null;
let replacingWindowTransition = false;
let cancelWindowPhysics = null;
let cancelWindowMoveSettle = null;
let lastWindowPosition = null;
let lastWindowMoveAt = 0;
let previousWindowVelocity = { x: 0, y: 0 };
let cleanupSoftWindowPhysics = null;
let developerMode = false;
let developerClockHour = null;
let developerPerformanceTimer = null;
let developerMotionTimer = null;
let latestDeveloperPerformance = 'Process CPU/memory has not been sampled.';
let overlayStartedPerformance = false;
let cancelDeveloperSpritePreview = null;
let developerSpritePack = null;
let developerSpriteImage = null;
let developerSpriteAnimation = null;
let developerSpriteAnimationStartedAt = 0;
let lastThemeApplyDurationMs = null;
const developerEvents = [];
const developerRuleTraces = [];
let deskBackgroundId = null;
let deskStickers = [];
const customImageUrls = new Map();
let renderedDeskBackgroundId;
let requestedDeskBackgroundId;
let deskBackgroundRequest = 0;

const clampMotion = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));

function createConfiguredSpring(options = {}) {
  return createSpring({
    ...options,
    stiffness: options.stiffness ?? animationSettings.stiffness,
    bounciness: options.bounciness ?? animationSettings.bounciness,
  });
}
function resetSoftWindowTransform() {
  const wrap = $('.wrap');
  wrap.style.transform = '';
  wrap.style.opacity = '';
  wrap.style.transformOrigin = '';
}

function animateSoftWindow(action) {
  const effectEnabled = action === 'hide'
    ? animationSettings.effects.hideToTray
    : animationSettings.effects.windowOpenClose;
  if (windowStyle !== 'soft' || !effectEnabled || !motionEngine.canAnimate('window')) {
    const previousTransition = cancelWindowTransition;
    cancelWindowTransition = null;
    replacingWindowTransition = true;
    previousTransition?.();
    replacingWindowTransition = false;
    cancelWindowTransition = null;
    resetSoftWindowTransform();
    if (action === 'hide') {
      void invoke('complete_window_hide').catch((error) => toast(`Could not hide the window: ${error}`));
    }
    return;
  }

  cancelWindowTransition?.();
  const wrap = $('.wrap');
  const hiding = action === 'hide';
  const start = hiding ? 1 : 0.92;
  const target = hiding ? 0.12 : 1;
  wrap.style.transformOrigin = 'bottom right';
  if (!hiding) {
    wrap.style.transform = `translate3d(0, 0, 0) scale(${start})`;
    wrap.style.opacity = '0';
  }
  const spring = createConfiguredSpring({
    preset: 'Default',
    position: start,
    target,
    minimum: 0.08,
    maximum: 1.04,
  });
  cancelWindowTransition = motionEngine.register({
    id: 'soft-window-transition',
    kind: 'window',
    element: wrap,
    onStop: (reason) => {
      cancelWindowTransition = null;
      if (reason === 'completed') {
        if (hiding) {
          void invoke('complete_window_hide').catch((error) => {
            resetSoftWindowTransform();
            toast(`Could not hide the window: ${error}`);
          });
        } else if (hiding && reason !== 'cancelled' && !replacingWindowTransition) {
          void invoke('complete_window_hide').catch((error) => {
            resetSoftWindowTransform();
            toast(`Could not hide the window: ${error}`);
          });
        } else {
          resetSoftWindowTransform();
        }
      } else {
        resetSoftWindowTransform();
      }
    },
    update({ deltaSeconds }) {
      const value = spring.advance(deltaSeconds);
      const scale = value.position;
      const progress = clampMotion((scale - 0.12) / (1 - 0.12), 0, 1);
      wrap.style.transform = hiding
        ? `perspective(700px) translate3d(22px, 24px, 0) rotateX(-7deg) scale(${scale})`
        : `translate3d(0, 0, 0) scale(${scale})`;
      wrap.style.opacity = String(hiding ? progress : clampMotion((scale - 0.92) / 0.08, 0, 1));
      if (!value.settled) return true;
      wrap.style.transform = hiding
        ? 'perspective(700px) translate3d(22px, 24px, 0) rotateX(-7deg) scale(0.12)'
        : 'translate3d(0, 0, 0) scale(1)';
      wrap.style.opacity = hiding ? '0' : '1';
      return false;
    },
  });
}

void listen('window-show-animation-requested', () => animateSoftWindow('show'))
  .catch((error) => toast(`Could not listen for window restore animations: ${error}`));
void listen('window-hide-animation-requested', () => animateSoftWindow('hide'))
  .catch((error) => toast(`Could not listen for window hide animations: ${error}`));

function applyWindowStyle(style) {
  windowStyle = style;
  root.dataset.windowStyle = style;
  if (style !== 'soft') {
    cancelWindowPhysics?.();
    cancelWindowPhysics = null;
    cancelWindowMoveSettle?.();
    cancelWindowMoveSettle = null;
    $('#desk').style.transform = '';
    $('#desk').style.rotate = '';
  }
}

async function changeWindowStyle(style) {
  const previous = windowStyle;
  await invoke('set_window_style', { style });
  applyWindowStyle(style);
  if (activeThemeId === 'transparent') applyTheme(activeThemeId);
  cleanupSoftWindowPhysics?.();
  cleanupSoftWindowPhysics = null;
  if (style === 'soft') {
    try {
      cleanupSoftWindowPhysics = await installSoftWindowPhysics();
    } catch (error) {
      applyWindowStyle(previous);
      if (activeThemeId === 'transparent') applyTheme(activeThemeId);
      try {
        await invoke('set_window_style', { style: previous });
      } catch (rollbackError) {
        throw new Error(`Could not initialize Soft window physics: ${error}; rollback failed: ${rollbackError}`);
      }
      throw new Error(`Could not initialize Soft window physics: ${error}`);
    }
    animateSoftWindow('show');
  }
}

async function installSoftWindowPhysics() {
  if (windowStyle !== 'soft' || cancelWindowPhysics || !motionEngine.canAnimate('window')
    || (!animationSettings.effects.softWindowJelly && !animationSettings.effects.elasticResize)) return;
  const desk = $('#desk');
  const wrap = $('.wrap');
  const x = createConfiguredSpring({ preset: 'Calm', minimum: -7, maximum: 7 });
  const y = createConfiguredSpring({ preset: 'Calm', minimum: -5, maximum: 5 });
  const rotation = createConfiguredSpring({ preset: 'Calm', minimum: -4, maximum: 4 });
  const skew = createConfiguredSpring({ preset: 'Calm', minimum: -1.5, maximum: 1.5 });
  const scaleX = createConfiguredSpring({ preset: 'Calm', minimum: 0.96, maximum: 1.04, position: 1, target: 1 });
  const scaleY = createConfiguredSpring({ preset: 'Calm', minimum: 0.96, maximum: 1.04, position: 1, target: 1 });
  let scaleFactor = await mainWindow.scaleFactor();
  let previousSize = await mainWindow.innerSize();
  const now = () => performance.now();

  const applyTransform = () => {
    const values = [x.snapshot(), y.snapshot(), rotation.snapshot(), skew.snapshot(), scaleX.snapshot(), scaleY.snapshot()];
    desk.style.transform = `translate3d(${values[0].position.toFixed(2)}px, ${values[1].position.toFixed(2)}px, 0) rotate(${values[2].position.toFixed(2)}deg) skewX(${values[3].position.toFixed(2)}deg)`;
    wrap.style.setProperty('--soft-resize-x', values[4].position.toFixed(3));
    wrap.style.setProperty('--soft-resize-y', values[5].position.toFixed(3));
    return values.every((value) => value.settled);
  };
  const resetPhysics = () => {
    desk.style.transform = '';
    wrap.style.removeProperty('--soft-resize-x');
    wrap.style.removeProperty('--soft-resize-y');
    cancelWindowPhysics = null;
  };
  const ensureAnimation = () => {
    if (cancelWindowPhysics || windowStyle !== 'soft' || !motionEngine.canAnimate('window')) return;
    cancelWindowPhysics = motionEngine.register({
      id: 'soft-window-physics',
      kind: 'window',
      element: wrap,
      onStop: resetPhysics,
      update({ deltaSeconds }) {
        for (const spring of [x, y, rotation, skew, scaleX, scaleY]) spring.advance(deltaSeconds);
        return !applyTransform();
      },
    });
  };
  const resetMoveTarget = () => {
    x.setTarget(0);
    y.setTarget(0);
    rotation.setTarget(0);
    skew.setTarget(0);
    ensureAnimation();
  };

  const unlistenMoved = await mainWindow.onMoved(({ payload }) => {
    if (windowStyle !== 'soft' || !animationSettings.effects.softWindowJelly
      || !motionEngine.canAnimate('window')) {
      lastWindowPosition = payload;
      lastWindowMoveAt = now();
      return;
    }
    const time = now();
    if (lastWindowPosition) {
      const deltaSeconds = Math.max((time - lastWindowMoveAt) / 1000, 0.008);
      const dx = (payload.x - lastWindowPosition.x) / scaleFactor;
      const dy = (payload.y - lastWindowPosition.y) / scaleFactor;
      const vx = clampMotion(dx / deltaSeconds, -1400, 1400);
      const vy = clampMotion(dy / deltaSeconds, -1400, 1400);
      const accelerationX = clampMotion((vx - previousWindowVelocity.x) / deltaSeconds, -5000, 5000);
      x.setTarget(clampMotion(-dx * 0.22, -7, 7));
      y.setTarget(clampMotion(-dy * 0.2, -5, 5));
      const availableVerticalSway = Math.max(0, 24 - 5);
      const maxAngle = Math.min(
        4,
        Math.asin(Math.min(1, availableVerticalSway / Math.max(desk.getBoundingClientRect().width / 2, 1)))
          * (180 / Math.PI),
      );
      rotation.setTarget(clampMotion(-vx / 360, -maxAngle, maxAngle));
      skew.setTarget(clampMotion(-accelerationX / 5000, -1.5, 1.5));
      previousWindowVelocity = { x: vx, y: vy };
      ensureAnimation();
      cancelWindowMoveSettle?.();
      cancelWindowMoveSettle = setTimeout(() => {
        cancelWindowMoveSettle = null;
        previousWindowVelocity = { x: 0, y: 0 };
        resetMoveTarget();
      }, 80);
    }
    lastWindowPosition = payload;
    lastWindowMoveAt = time;
  });
  const unlistenResized = await mainWindow.onResized(({ payload }) => {
    if (windowStyle !== 'soft' || !animationSettings.effects.elasticResize
      || !motionEngine.canAnimate('window')) {
      previousSize = payload;
      return;
    }
    const logicalWidth = payload.width / scaleFactor;
    const logicalHeight = payload.height / scaleFactor;
    const oldWidth = previousSize.width / scaleFactor;
    const oldHeight = previousSize.height / scaleFactor;
    scaleX.setTarget(clampMotion(oldWidth / logicalWidth, 0.96, 1.04));
    scaleY.setTarget(clampMotion(oldHeight / logicalHeight, 0.96, 1.04));
    previousSize = payload;
    ensureAnimation();
  });
  const unlistenScale = await mainWindow.onScaleChanged(async ({ payload }) => {
    scaleFactor = payload.scaleFactor;
    previousSize = await mainWindow.innerSize();
  });
  return () => {
    unlistenMoved();
    unlistenResized();
    unlistenScale();
    cancelWindowPhysics?.();
    cancelWindowPhysics = null;
    cancelWindowMoveSettle?.();
    cancelWindowMoveSettle = null;
    desk.style.transform = '';
    lastWindowPosition = null;
    lastWindowMoveAt = 0;
    previousWindowVelocity = { x: 0, y: 0 };
  };
}

const reducedMotionPreference = matchMedia('(prefers-reduced-motion: reduce)');
reducedMotionPreference.addEventListener('change', (event) => {
  motionEngine.setEnvironment({ reducedMotion: event.matches });
  applyAnimationSettings(animationSettings);
  if (event.matches) {
    cancelWindowPhysics?.();
    cancelWindowPhysics = null;
    $('#desk').style.transform = '';
    $('#desk').style.rotate = '';
  } else if (windowStyle === 'soft') {
    void installSoftWindowPhysics()
      .then((cleanup) => { cleanupSoftWindowPhysics = cleanup; })
      .catch((error) => toast(`Could not enable Soft window physics: ${error}`));
  }
});

$('#themeFontSelect').addEventListener('change', (event) =>
  void saveSchedulePreference('fontOverride', event.currentTarget.value || null));

document.addEventListener('visibilitychange', () => {
  const visible = document.visibilityState !== 'hidden';
  root.dataset.documentVisible = String(visible);
  if (visible) return;
  resetDockMagnification();
  $('#desk').style.rotate = '';
  for (const animation of rubberBandAnimations.values()) animation.cancel();
  cancelListExitAnimations();
});

$('#appHeader').addEventListener('pointerdown', (event) => {
  if (windowStyle !== 'soft' || event.button !== 0
    || event.target.closest('button, input, select, a')) return;
  void mainWindow.startDragging()
    .catch((error) => toast(`Could not drag the Soft window: ${error}`));
});
$('#appHeader').addEventListener('dblclick', (event) => {
  if (windowStyle !== 'soft' || event.target.closest('button, input, select, a')) return;
  void mainWindow.toggleMaximize()
    .catch((error) => toast(`Could not maximize the Soft window: ${error}`));
});
document.querySelectorAll('[data-resize-direction]').forEach((handle) => {
  handle.addEventListener('pointerdown', (event) => {
    if (windowStyle !== 'soft' || event.button !== 0) return;
    event.preventDefault();
    void mainWindow.startResizeDragging(handle.dataset.resizeDirection)
      .catch((error) => toast(`Could not resize the Soft window: ${error}`));
  });
});
$('#softMinimize').addEventListener('click', () => {
  void mainWindow.minimize().catch((error) => toast(`Could not minimize the window: ${error}`));
});
$('#softMaximize').addEventListener('click', () => {
  void mainWindow.toggleMaximize().catch((error) => toast(`Could not maximize the window: ${error}`));
});
$('#softClose').addEventListener('click', () => {
  void mainWindow.close().catch((error) => toast(`Could not close the window: ${error}`));
});

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 1600);
}

eventBus.on('break.due', () => {
  if (!interfaceMotionReady) return;
  const policy = motionEngine.getPolicy();
  if (interfaceMotion.reminder_bounce && optionalEffectsActive()) moduleContext?.hop();
  if (interfaceMotion.taskbar_flash
    && animationsEnabled
    && !policy.reducedMotion
    && !policy.ecoMode) {
    void mainWindow.requestUserAttention(UserAttentionType.Informational)
      .catch((error) => toast(`Could not request taskbar attention: ${error}`));
  }
});

function describeStartupError(error) {
  if (error instanceof AggregateError) {
    return `${error.message}: ${[...error.errors].map(describeStartupError).join('; ')}`;
  }
  return `${error?.name ? `${error.name}: ` : ''}${error?.message ?? String(error)}`;
}

function allThemes() {
  return [...builtinThemes, ...userThemes];
}

function themeById(id) {
  return allThemes().find((theme) => theme.meta?.id === id);
}

function updateThemeContrastStatus(theme) {
  const contrastTheme = {
    ...theme,
    ...(themePreferences.accentOverride ? { accent: themePreferences.accentOverride } : {}),
  };
  const report = checkThemeContrast(contrastTheme);
  const failures = report.checks.filter((check) => !check.passed);
  const status = $('#themeContrastStatus');
  status.textContent = failures.length
    ? `Contrast warning: ${failures.map((check) => `${check.id} ${check.ratio.toFixed(2)}:1 (needs ${check.minimum}:1)`).join('; ')}`
    : 'All checked text, accent, edge, and focus pairs meet their contrast thresholds.';
  const canFix = !builtinThemeIds.has(theme.meta?.id) || Boolean(themePreferences.accentOverride);
  $('#themeAutoFixButton').disabled = failures.length === 0 || !canFix;
  $('#themeAutoFixButton').hidden = !canFix;
}

function renderThemeInspector(theme = currentThemeObject, overrides = {}) {
  if (!$('#developerThemeInspector')) return;
  const report = checkThemeContrast({ ...theme, ...overrides });
  const pairs = report.checks.map((check) =>
    `${check.passed ? 'PASS' : 'FAIL'} ${check.id}: ${check.ratio.toFixed(2)}:1 / ${check.minimum}:1${check.outlined ? ' (text outline enabled)' : ''}`);
  $('#developerThemeInspector').textContent = JSON.stringify({
    theme: theme.meta?.id,
    tokens: resolvedThemeTokens,
    contrast: pairs,
    synchronousApplyMs: lastThemeApplyDurationMs === null
      ? 'not measured'
      : Number(lastThemeApplyDurationMs.toFixed(2)),
  }, null, 2);
}

function renderThemeColorEditor() {
  const container = $('#themeColorEditor');
  const editable = !builtinThemeIds.has(activeThemeId);
  $('#themeSaveEditsButton').hidden = !editable;
  container.replaceChildren();
  for (const field of ['bg', 'wall', 'drawer', 'edge', 'ink', 'inkSecondary', 'accent', 'buddy', 'desk']) {
    if (currentThemeObject[field] === undefined) continue;
    const label = document.createElement('label');
    label.textContent = field;
    const input = document.createElement('input');
    input.type = 'color';
    input.value = colorInputValue(currentThemeObject[field]);
    input.disabled = !editable;
    input.setAttribute('aria-label', `Edit ${field} theme color`);
    input.addEventListener('input', () => {
      const theme = themeById(activeThemeId);
      const index = userThemes.findIndex((item) => item.meta.id === activeThemeId);
      if (!theme || index < 0) return;
      userThemes[index] = validateTheme({ ...theme, [field]: input.value });
      applyTheme(activeThemeId, { preview: true });
    });
    label.append(input);
    container.append(label);
  }
}

function colorInputValue(value) {
  const color = parseThemeColor(value);
  return `#${[color.r, color.g, color.b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

function renderThemePicker() {
  const themes = allThemes();
  $('#themeCount').textContent =
    `${builtinThemes.length} built-in themes · ${userThemes.length} user themes`;
  for (const select of [$('#settingsTheme'), $('#lightThemeSelect'), $('#darkThemeSelect')]) {
    const selected = select.value;
    select.replaceChildren();
    for (const theme of themes) {
      const option = document.createElement('option');
      option.value = theme.meta.id;
      option.textContent = theme.meta.name ?? theme.meta.id;
      select.append(option);
    }
    if (themes.some((theme) => theme.meta.id === selected)) select.value = selected;
  }
  const gallery = $('#themeGallery');
  gallery.replaceChildren();
  for (const theme of themes) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'theme-card';
    card.setAttribute('aria-label', `${theme.meta.name ?? theme.meta.id} theme`);
    card.setAttribute('aria-pressed', String(theme.meta.id === activeThemeId));
    const preview = document.createElement('span');
    preview.className = 'theme-card-preview';
    for (const className of ['preview-wall', 'preview-drawer', 'preview-desk']) {
      const swatch = document.createElement('span');
      swatch.className = className;
      preview.append(swatch);
    }
    preview.querySelector('.preview-wall').style.backgroundColor = theme.wall;
    preview.querySelector('.preview-drawer').style.backgroundColor = theme.drawer;
    preview.querySelector('.preview-desk').style.backgroundColor = theme.desk;
    const title = document.createElement('strong');
    title.textContent = theme.meta.name ?? theme.meta.id;
    const author = document.createElement('small');
    author.textContent = theme.meta.author ?? 'User theme';
    card.append(preview, title, author);
    card.addEventListener('pointerenter', () => applyTheme(theme.meta.id, { preview: true }));
    card.addEventListener('pointerleave', () => applyTheme(activeThemeId));
    card.addEventListener('focus', () => applyTheme(theme.meta.id, { preview: true }));
    card.addEventListener('blur', () => applyTheme(activeThemeId));
    card.addEventListener('click', () => void setTheme(theme.meta.id));
    gallery.append(card);
  }
  renderThemeColorEditor();
}

function applyTheme(theme, { preview = false, forceSolid = false } = {}) {
  const applyStartedAt = performance.now();
  const selectedId = theme === 'glass' ? 'frost' : theme;
  const selected = themeById(selectedId) ?? builtinThemes[0];
  const selectedThemeId = selected.meta.id;
  const basePresentation = selectedThemeId === 'transparent' && windowStyle !== 'soft'
    ? builtinThemes.find((candidate) => candidate.meta.id === 'paper')
    : selected;
  const opacity = themePreferences.opacityOverrides[selectedThemeId];
  const overrides = {
    ...(themePreferences.accentOverride ? { accent: themePreferences.accentOverride } : {}),
    ...(themePreferences.fontOverride ? { font: themePreferences.fontOverride } : {}),
  };
  if (selectedThemeId === 'transparent' && windowStyle !== 'soft') {
    root.dataset.themeFallback = 'native';
    forceSolid = true;
  } else if (forceSolid) {
    root.dataset.themeFallback = 'solid';
  } else {
    delete root.dataset.themeFallback;
  }
  if (selectedThemeId === 'transparent' || selectedThemeId === 'frost' || selectedThemeId === 'glass') {
    cancelListExitAnimations();
    resetDockMagnification();
    $('#desk').style.rotate = '';
    for (const animation of rubberBandAnimations.values()) animation.cancel();
  }
  const presentation = {
    ...basePresentation,
    effects: {
      ...(basePresentation.effects ?? {}),
      ...(opacity !== undefined ? { panelOpacity: opacity / 100 } : {}),
    },
  };
  currentThemeObject = presentation;
  if (!preview) activeThemeId = selectedThemeId;
  renderThemeStickerPicker(selected);
  void setThemeDeskBackground(selectedThemeId).catch((error) => {
    $('#deskCustomizationStatus').textContent = `Could not load theme background: ${error}`;
  });
  root.dataset.theme = selectedThemeId;
  root.dataset.buddyFollowsTheme = String(themePreferences.buddyFollowsTheme);
  root.dataset.themeEffect = forceSolid ? 'none' : presentation.effects?.windowEffect ?? 'none';
  resolvedThemeTokens = applyThemeTokens(root.style, presentation, { ...overrides, forceSolid });
  $('#theme').textContent = `Theme: ${selected.meta.name ?? selectedThemeId}`;
  if ($('#settingsTheme')) $('#settingsTheme').value = selectedThemeId;
  const supportsOpacity = ['transparent', 'frost'].includes(selectedThemeId);
  $('#glassOpacity').disabled = !supportsOpacity;
  $('#glassOpacity').value = String(opacity ?? Math.round((presentation.effects?.panelOpacity ?? 1) * 100));
  $('#glassOpacityValue').value = `${$('#glassOpacity').value}%`;
  if ($('#themeAccentEditor')) {
    const accent = overrides.accent ?? presentation.accent;
    $('#themeAccentEditor').value = colorInputValue(accent);
  }
  updateThemeContrastStatus(presentation);
  document.dispatchEvent(new CustomEvent('desk-drawer-theme-changed', {
    detail: { themeId: selectedThemeId },
  }));
  lastThemeApplyDurationMs = performance.now() - applyStartedAt;
  renderThemeInspector(presentation, overrides);
  if (root.dataset.themeFallback === 'native' && selectedThemeId === 'transparent') {
    $('#themeContrastStatus').textContent = 'Transparent requires Soft window style. Native style is showing a safe solid Paper fallback.';
  } else if (root.dataset.themeFallback === 'solid') {
    $('#themeContrastStatus').textContent = `${selected.meta.name ?? selectedThemeId}: native window effect unavailable; using a readable solid-color fallback.`;
  }
  if (!preview) {
    for (const card of $('#themeGallery').querySelectorAll('.theme-card')) {
      card.setAttribute('aria-pressed', String(card.getAttribute('aria-label') === `${selected.meta.name ?? selected.meta.id} theme`));
    }
  }
  return presentation;
}

function transitionTheme(theme) {
  if (interfaceMotionReady
    && interfaceMotion.theme_crossfade
    && optionalEffectsActive()
    && !reducedMotionPreference.matches
    && !motionEngine.getPolicy().ecoMode
    && root.dataset.themeEffect !== 'mica'
    && themeById(theme)?.effects?.windowEffect !== 'mica'
    && typeof document.startViewTransition === 'function') {
    try {
      const transition = document.startViewTransition(() => applyTheme(theme));
      return transition.updateCallbackDone.catch(() => applyTheme(theme));
    } catch {
      applyTheme(theme);
      return Promise.resolve();
    }
  }
  applyTheme(theme);
  return Promise.resolve();
}

function applyMotionPreference(enabled) {
  animationsEnabled = enabled;
  $('#animationsEnabled').checked = enabled;
  applyAnimationSettings(animationSettings);
  if (!enabled) {
    resetDockMagnification();
    $('#desk').style.rotate = '';
  }
}

const ANIMATION_EFFECT_CONTROLS = Object.freeze({
  buddyMovementEnabled: 'buddyMovement',
  buddyAnimationsEnabled: 'buddyAnimation',
  motionJelly: 'softWindowJelly',
  motionOpenClose: 'windowOpenClose',
  motionHideTray: 'hideToTray',
  motionResize: 'elasticResize',
  motionBuddyTransitions: 'buddyTransitions',
  motionBuddyImpacts: 'buddyImpacts',
  motionSticker: 'stickerMotion',
  motionParticles: 'particles',
});

function applyAnimationSettings(settings) {
  animationSettings = normalizeAnimationSettings(settings);
  const intensity = animationsEnabled ? animationSettings.intensity : 'off';
  const slowMotionMultiplier = developerMode ? animationSettings.slowMotionMultiplier : 1;
  motionEngine.setEnvironment({ ecoMode: animationSettings.ecoMode });
  root.dataset.ecoMode = String(animationSettings.ecoMode);
  motionEngine.setSettings({
    intensity,
    speedMultiplier: animationSettings.speedMultiplier,
    stiffness: animationSettings.stiffness,
    bounciness: animationSettings.bounciness,
    slowMotionMultiplier,
  });
  const policy = motionEngine.getPolicy();
  const motionOff = intensity === 'off' || policy.reducedMotion || policy.ecoMode;
  applyMotionCssTokens(root.style, {
    enabled: !motionOff,
    speedMultiplier: animationSettings.speedMultiplier,
    slowMotionMultiplier,
  });
  root.dataset.motion = motionOff ? 'off' : 'on';
  $('#animationIntensity').value = animationSettings.intensity;
  $('#animationSpeed').value = String(animationSettings.speedMultiplier);
  $('#animationSpeedValue').value = `${animationSettings.speedMultiplier.toFixed(1)}×`;
  $('#animationStiffness').value = String(animationSettings.stiffness);
  $('#animationStiffnessValue').value = String(Math.round(animationSettings.stiffness));
  $('#animationBounciness').value = String(animationSettings.bounciness);
  $('#animationBouncinessValue').value = `${Math.round(animationSettings.bounciness * 100)}%`;
  $('#developerSlowMotion').value = String(animationSettings.slowMotionMultiplier);
  $('#developerSlowMotionValue').value = `${animationSettings.slowMotionMultiplier.toFixed(1)}×`;
  $('#ecoMode').checked = animationSettings.ecoMode;
  for (const [id, key] of Object.entries(ANIMATION_EFFECT_CONTROLS)) {
    $(`#${id}`).checked = animationSettings.effects[key];
  }
  if (!animationSettings.effects.particles) {
    particlePool?.dispose();
    particlePool = null;
  }
  if (!animationSettings.effects.stickerMotion) {
    document.querySelectorAll('.desk-sticker').forEach((element) => deskItemAnimations.get(element)?.());
  }
  if (windowStyle === 'soft'
    && cancelWindowPhysics) {
    cancelWindowPhysics?.();
    cancelWindowPhysics = null;
  }
  eventBus.emit('buddy.animation.settings.changed', {
    settings: animationSettings,
    enabled: intensity !== 'off',
  });
}

async function saveAnimationSettings(settings) {
  const previous = animationSettings;
  const next = normalizeAnimationSettings(settings);
  applyAnimationSettings(next);
  try {
    await invoke('set_animation_settings', { settings: next });
  } catch (error) {
    applyAnimationSettings(previous);
    toast(`Could not save animation settings: ${error}`);
    throw error;
  }
}

async function setTheme(theme) {
  const previous = root.dataset.theme;
  try {
    if (theme === 'transparent' && windowStyle !== 'soft'
      && window.confirm('Transparent needs Soft window style. Switch to Soft now? Choose Cancel to use a safe solid fallback.')) {
      await changeWindowStyle('soft');
      $('#windowStyle').value = 'soft';
    }
    await transitionTheme(theme);
    const requestedEffect = themeById(theme)?.effects?.windowEffect ?? 'none';
    const nativeEffectApplied = await invoke('set_theme', { theme, effect: requestedEffect });
    if (requestedEffect !== 'none' && !nativeEffectApplied) {
      applyTheme(theme, { forceSolid: true });
    }
    renderThemePicker();
  } catch (error) {
    applyTheme(previous);
    toast(`Could not save the theme: ${error}`);
  }
}

$('#theme').onclick = () => {
  const themes = allThemes();
  const index = themes.findIndex((theme) => theme.meta.id === activeThemeId);
  void setTheme(themes[(index + 1) % themes.length].meta.id);
};

$('#settingsTheme').addEventListener('change', (event) => setTheme(event.currentTarget.value));

async function persistThemePreferences() {
  themePreferences = migrateThemePreferences({
    ...themePreferences,
    customThemes: userThemes.map((theme) => serializeThemeFile(theme)),
  });
  await invoke('set_theme_preferences', { settings: themePreferences });
  savedThemePreferences = structuredClone(themePreferences);
}

function renderThemePreferenceControls() {
  $('#themeFollowSystem').checked = themePreferences.followSystem;
  $('#themeFontSelect').value = themePreferences.fontOverride ?? '';
  $('#themeScheduleEnabled').checked = themePreferences.scheduleEnabled;
  $('#themeBuddyFollows').checked = themePreferences.buddyFollowsTheme;
  $('#lightThemeSelect').value = themePreferences.lightTheme;
  $('#darkThemeSelect').value = themePreferences.darkTheme;
  $('#themeLightStart').value = themePreferences.lightStart;
  $('#themeDarkStart').value = themePreferences.darkStart;
  renderThemeStickerPicker();
  const accent = parseThemeColor(themePreferences.accentOverride ?? currentThemeObject.accent);
  $('#themeAccentEditor').value = `#${[accent.r, accent.g, accent.b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
  renderThemePicker();
}

function themeAssetIds(theme) {
  return [theme?.background, ...(theme?.stickers ?? [])].filter(Boolean);
}

function themeReferencesAsset(id) {
  return allThemes().some((theme) => themeAssetIds(theme).includes(id));
}

function renderThemeStickerPicker(theme = themeById(activeThemeId)) {
  const select = $('#themeStickerSelect');
  const stickers = theme?.stickers ?? [];
  const selected = select.value;
  select.replaceChildren();
  for (const id of stickers) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = id;
    select.append(option);
  }
  if (stickers.includes(selected)) select.value = selected;
  $('#addThemeSticker').disabled = stickers.length === 0 || deskStickers.length >= 12
    || deskStickers.some(({ id }) => id === select.value);
}

$('#themeStickerSelect').addEventListener('change', () => renderThemeStickerPicker());
$('#addThemeSticker').addEventListener('click', async () => {
  const id = $('#themeStickerSelect').value;
  if (!id || deskStickers.length >= 12 || deskStickers.some((sticker) => sticker.id === id)) return;
  const index = deskStickers.length;
  const next = [...deskStickers, {
    id,
    x: Math.min(78, 4 + (index % 5) * 15),
    y: index % 2 === 0 ? 4 : 12,
    width: 18,
    height: 70,
  }];
  try {
    await invoke('save_desk_stickers', { stickers: next });
    deskStickers = next;
    pendingStickerUnlocks.add(id);
    await renderDeskCustomization();
    $('#deskCustomizationStatus').textContent = 'Theme sticker added. Drag it to move or resize it.';
  } catch (error) {
    $('#deskCustomizationStatus').textContent = `Could not add theme sticker: ${error}`;
  }
});

$('#themeAccentEditor').addEventListener('input', () => {
  themePreferences.accentOverride = $('#themeAccentEditor').value;
  const theme = themeById(activeThemeId);
  if (theme) applyTheme(activeThemeId);
  updateThemeContrastStatus(currentThemeObject);
});

$('#themeAccentEditor').addEventListener('change', () => {
  void persistThemePreferences().catch((error) => {
    themePreferences = structuredClone(savedThemePreferences);
    renderThemePreferenceControls();
    applyTheme(activeThemeId);
    toast(`Could not save accent override: ${error}`);
  });
});

$('#themeFollowSystem').addEventListener('change', async () => {
  themePreferences.followSystem = $('#themeFollowSystem').checked;
  try {
    await persistThemePreferences();
    applyScheduledOrSystemTheme();
  } catch (error) {
    $('#themeFollowSystem').checked = !themePreferences.followSystem;
    themePreferences.followSystem = !themePreferences.followSystem;
    toast(`Could not save theme appearance settings: ${error}`);
  }
});

async function saveSchedulePreference(field, value) {
  const previous = themePreferences[field];
  themePreferences[field] = value;
  try {
    await persistThemePreferences();
    if (field === 'buddyFollowsTheme') {
      root.dataset.buddyFollowsTheme = String(value);
      document.dispatchEvent(new Event('desk-drawer-theme-changed'));
    }
    applyScheduledOrSystemTheme();
    if (field === 'fontOverride') applyTheme(activeThemeId);
  } catch (error) {
    themePreferences[field] = previous;
    renderThemePreferenceControls();
    toast(`Could not save theme schedule: ${error}`);
  }
}

$('#themeScheduleEnabled').addEventListener('change', (event) =>
  void saveSchedulePreference('scheduleEnabled', event.currentTarget.checked));
$('#themeBuddyFollows').addEventListener('change', (event) =>
  void saveSchedulePreference('buddyFollowsTheme', event.currentTarget.checked));
$('#themeLightStart').addEventListener('change', (event) =>
  void saveSchedulePreference('lightStart', event.currentTarget.value));
$('#themeDarkStart').addEventListener('change', (event) =>
  void saveSchedulePreference('darkStart', event.currentTarget.value));
$('#lightThemeSelect').addEventListener('change', (event) =>
  void saveSchedulePreference('lightTheme', event.currentTarget.value));
$('#darkThemeSelect').addEventListener('change', (event) =>
  void saveSchedulePreference('darkTheme', event.currentTarget.value));

function applyScheduledOrSystemTheme() {
  const scheduled = resolveScheduledTheme(themePreferences);
  const systemDark = themePreferences.followSystem
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const selected = scheduled ?? (systemDark
    ? themePreferences.darkTheme
    : themePreferences.lightTheme);
  if ((scheduled || themePreferences.followSystem)
    && themeById(selected)
    && selected !== activeThemeId) {
    void setTheme(selected);
  }
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (themePreferences.followSystem && !themePreferences.scheduleEnabled) applyScheduledOrSystemTheme();
});
window.setInterval(() => {
  if (themePreferences.scheduleEnabled) applyScheduledOrSystemTheme();
}, 60_000);

$('#themeImportButton').addEventListener('click', async () => {
  try {
    const path = await open({
      multiple: false,
      filters: [{ name: 'Desk themes', extensions: ['desktheme'] }],
    });
    if (!path) return;
    const bundle = await invoke('inspect_theme_bundle', { path });
    const imported = parseThemeFile(bundle.themeJson);
    const generatedId = imported.meta?.id
      ?? `imported-${Date.now().toString(36)}`;
    const custom = validateTheme({
      ...imported,
      meta: {
        ...imported.meta,
        id: generatedId,
        name: imported.meta?.name ?? path.split(/[\\/]/).at(-1).replace(/\.desktheme$/i, '').slice(0, 60),
      },
    });
    if (themeById(custom.meta.id)) throw new Error(`Theme id "${custom.meta.id}" already exists.`);
    if (bundle.assets.length) {
      await invoke('install_theme_bundle_assets', {
        themeJson: serializeThemeFile(custom),
        assets: bundle.assets,
      });
    }
    userThemes.push(custom);
    await persistThemePreferences();
    renderThemePicker();
    toast(`Imported ${custom.meta.name}.`);
  } catch (error) {
    toast(`Could not import theme: ${error}`);
  }
});

$('#themeExportButton').addEventListener('click', () => {
  void (async () => {
    try {
      const ids = themeAssetIds(currentThemeObject);
      if (ids.length) {
        const assets = [];
        for (const id of ids) {
          const image = await invoke('get_custom_image', { id });
          const extension = ({
            'image/png': 'png',
            'image/jpeg': id.match(/\.jpeg$/i) ? 'jpeg' : 'jpg',
            'image/webp': 'webp',
            'image/gif': 'gif',
          })[image.mimeType];
          if (!extension) throw new Error(`Unsupported image type for theme asset ${id}.`);
          assets.push({ id, extension, bytes: image.bytes });
        }
        const path = await save({
          defaultPath: `${currentThemeObject.meta?.id ?? 'desk-theme'}.desktheme`,
          filters: [{ name: 'Desk theme bundle', extensions: ['desktheme'] }],
        });
        if (!path) return;
        await invoke('export_theme_bundle', {
          themeJson: serializeThemeFile(currentThemeObject),
          assets,
          path,
        });
        toast(`Exported ${currentThemeObject.meta?.name ?? 'theme'} with ${assets.length} asset(s).`);
        return;
      }
    const blob = new Blob([serializeThemeFile(currentThemeObject)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentThemeObject.meta?.id ?? 'desk-theme'}.desktheme`;
    link.click();
    URL.revokeObjectURL(url);
    } catch (error) {
      toast(`Could not export theme: ${error}`);
    }
  })();
});

$('#themeDuplicateButton').addEventListener('click', async () => {
  const source = themeById(activeThemeId);
  const enteredName = $('#themeDuplicateName').value.trim();
  if (!enteredName) {
    toast('Enter a name for the duplicated theme first.');
    $('#themeDuplicateName').focus();
    return;
  }
  const id = enteredName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  try {
    const duplicate = validateTheme({
      ...source,
      meta: { ...source.meta, id, name: enteredName.trim() },
    });
    if (themeById(id)) throw new Error(`Theme id "${id}" already exists.`);
    userThemes.push(duplicate);
    await persistThemePreferences();
    $('#themeDuplicateName').value = '';
    renderThemePicker();
    await setTheme(id);
  } catch (error) {
    toast(`Could not duplicate theme: ${error}`);
  }
});

$('#themeResetButton').addEventListener('click', async () => {
  const original = builtinThemes.find((theme) => theme.meta.id === activeThemeId);
  if (!original) {
    toast('Choose a built-in theme to reset it.');
    return;
  }
  themePreferences.accentOverride = null;
  delete themePreferences.opacityOverrides[activeThemeId];
  try {
    await persistThemePreferences();
    applyTheme(original.meta.id);
  } catch (error) {
    toast(`Could not reset theme settings: ${error}`);
  }
});

$('#themePreviewRevert').addEventListener('click', () => applyTheme(activeThemeId));
$('#themeSaveEditsButton').addEventListener('click', async () => {
  try {
    const theme = themeById(activeThemeId);
    const report = checkThemeContrast(theme);
    await persistThemePreferences();
    renderThemePicker();
    updateThemeContrastStatus(theme);
    toast(report.passed ? 'Theme edits saved.' : 'Theme saved with contrast warnings.');
  } catch (error) {
    toast(`Could not save theme edits: ${error}`);
  }
});

$('#themeAutoFixButton').addEventListener('click', async () => {
  const index = userThemes.findIndex((theme) => theme.meta.id === activeThemeId);
  const source = index < 0
    ? { ...currentThemeObject, accent: themePreferences.accentOverride ?? currentThemeObject.accent }
    : userThemes[index];
  const fixed = fixThemeContrast(source);
  const unresolved = fixed.changes.filter((change) => change.unresolved);
  if (unresolved.length) {
    toast(`Some colors cannot be fixed automatically: ${unresolved.map((change) => change.field).join(', ')}`);
    return;
  }
  if (index < 0) {
    const unrelatedChanges = fixed.changes.filter((change) => change.field !== 'accent');
    if (unrelatedChanges.length) {
      toast('This override requires other built-in palette changes. Duplicate the built-in theme to fix all colors.');
      return;
    }
    themePreferences.accentOverride = fixed.theme.accent;
  }
  else userThemes[index] = validateTheme(fixed.theme);
  try {
    await persistThemePreferences();
    applyTheme(activeThemeId);
    toast(`Adjusted ${fixed.changes.map((change) => `${change.field}: ${change.from} to ${change.to}`).join('; ') || 'no colors'}.`);
  } catch (error) {
    toast(`Could not save contrast fixes: ${error}`);
  }
});

$('#animationsEnabled').addEventListener('change', async (event) => {
  const enabled = event.currentTarget.checked;
  try {
    await invoke('set_animations_enabled', { enabled });
    applyMotionPreference(enabled);
    eventBus.emit('buddy.animations.changed', { enabled });
  } catch (error) {
    event.currentTarget.checked = !enabled;
    toast(`Could not save animation settings: ${error}`);
  }
});

$('#ecoMode').addEventListener('change', (event) => {
  void saveAnimationSettings({
    ...animationSettings,
    ecoMode: event.currentTarget.checked,
  }).catch(() => {});
});

for (const [id, key] of Object.entries(ANIMATION_EFFECT_CONTROLS)) {
  $(`#${id}`).addEventListener('change', (event) => {
    void saveAnimationSettings({
      ...animationSettings,
      effects: { ...animationSettings.effects, [key]: event.currentTarget.checked },
    }).catch(() => {});
  });
}

$('#animationIntensity').addEventListener('change', (event) => {
  void saveAnimationSettings({ ...animationSettings, intensity: event.currentTarget.value }).catch(() => {});
});

$('#animationSpeed').addEventListener('input', (event) => {
  $('#animationSpeedValue').value = `${Number(event.currentTarget.value).toFixed(1)}×`;
});
$('#animationStiffness').addEventListener('input', (event) => {
  $('#animationStiffnessValue').value = event.currentTarget.value;
});
$('#animationBounciness').addEventListener('input', (event) => {
  $('#animationBouncinessValue').value = `${Math.round(Number(event.currentTarget.value) * 100)}%`;
});
for (const [id, key] of [
  ['animationSpeed', 'speedMultiplier'],
  ['animationStiffness', 'stiffness'],
  ['animationBounciness', 'bounciness'],
]) {
  $(`#${id}`).addEventListener('change', (event) => {
    void saveAnimationSettings({
      ...animationSettings,
      [key]: Number(event.currentTarget.value),
    }).catch(() => {});
  });
}

$('#developerSlowMotion').addEventListener('input', (event) => {
  $('#developerSlowMotionValue').value = `${Number(event.currentTarget.value).toFixed(1)}×`;
});
$('#developerSlowMotion').addEventListener('change', (event) => {
  if (!developerMode) return;
  void saveAnimationSettings({
    ...animationSettings,
    slowMotionMultiplier: Number(event.currentTarget.value),
  }).catch(() => {});
});

function drawSpringGraph(samples) {
  const canvas = $('#developerSpringGraph');
  const context = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const styles = getComputedStyle(root);
  const edge = styles.getPropertyValue('--edge').trim();
  const accent = styles.getPropertyValue('--accent').trim();
  const ink = styles.getPropertyValue('--ink').trim();
  context.clearRect(0, 0, width, height);
  context.strokeStyle = edge;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, height / 2);
  context.lineTo(width, height / 2);
  context.stroke();
  const maxVelocity = Math.max(1, ...samples.map((sample) => Math.abs(sample.velocity)));
  for (const [field, color] of [['displacement', accent], ['velocity', ink]]) {
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    samples.forEach((sample, index) => {
      const value = field === 'displacement'
        ? (sample.displacement - 0.5) / 1.2
        : sample.velocity / maxVelocity;
      const x = index * width / (samples.length - 1);
      const y = height / 2 - value * (height * 0.42);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }
  canvas.setAttribute(
    'aria-label',
    `Spring graph with ${samples.length} samples. Accent is displacement and text color is velocity.`,
  );
}

const animationLabCancels = new Map();
function replayAnimationPreview(id) {
  const card = document.querySelector(`.animation-preview-card[data-preview="${CSS.escape(id)}"]`);
  if (!card || !motionEngine.canAnimate('ui')) {
    $('#animationLabStatus').textContent = 'Animation preview is off because motion is disabled, reduced, or in Eco mode.';
    return;
  }
  const shape = card.querySelector('.animation-preview-shape');
  animationLabCancels.get(id)?.();
  const spring = createConfiguredSpring({
    preset: animationSettings.intensity === 'lively' ? 'Lively' : 'Default',
    stiffness: animationSettings.stiffness,
    bounciness: animationSettings.bounciness,
    position: 0,
    target: 1,
    minimum: -0.1,
    maximum: 1.15,
  });
  const curve = sampleSpringCurve(createSpring, {
    stiffness: animationSettings.stiffness,
    bounciness: animationSettings.bounciness,
  });
  drawSpringGraph(curve);
  const startX = id === 'window' || id === 'sticker' ? -20 : 0;
  const startScale = id === 'window' ? 0.84 : id === 'impact' ? 0.68 : 0.78;
  const cancel = motionEngine.register({
    id: `animation-lab-${id}`,
    kind: 'ui',
    element: shape,
    onStop() {
      shape.style.removeProperty('--preview-x');
      shape.style.removeProperty('--preview-scale');
      shape.style.removeProperty('--preview-opacity');
      if (animationLabCancels.get(id) === cancel) animationLabCancels.delete(id);
    },
    update({ deltaSeconds }) {
      const sample = spring.advance(deltaSeconds);
      const progress = sample.position;
      shape.style.setProperty('--preview-x', `${startX * (1 - progress)}px`);
      shape.style.setProperty('--preview-scale', String(startScale + (1 - startScale) * progress));
      shape.style.setProperty('--preview-opacity', String(clampMotion(progress, 0, 1)));
      return !sample.settled;
    },
  });
  animationLabCancels.set(id, cancel);
  $('#animationLabStatus').textContent = `Replaying ${id} preview. The graph shows its spring displacement and velocity.`;
}

document.querySelectorAll('[data-replay-animation]').forEach((button) => {
  button.addEventListener('click', () => replayAnimationPreview(button.dataset.replayAnimation));
});

async function resetAnimationSettings() {
  await invoke('set_animations_enabled', { enabled: true });
  applyMotionPreference(true);
  await saveAnimationSettings(DEFAULT_ANIMATION_SETTINGS);
  await saveInterfaceMotion(DEFAULT_INTERFACE_MOTION);
}

$('#resetAnimationLab').addEventListener('click', () => {
  void resetAnimationSettings().then(() => {
    $('#animationLabStatus').textContent = 'Animation settings restored to defaults.';
  }).catch((error) => toast(`Could not reset animation defaults: ${error}`));
});

$('#drawerStyle').addEventListener('change', (event) => {
  const settings = { ...interfaceMotion, drawer_style: event.currentTarget.value };
  void saveInterfaceMotion(settings).catch(() => {});
});

for (const [id, key] of [
  ['dockMagnification', 'dock_magnification'],
  ['rubberBandScrolling', 'rubber_band'],
  ['cursorTilt', 'cursor_tilt'],
  ['reminderBounce', 'reminder_bounce'],
  ['taskbarFlash', 'taskbar_flash'],
  ['listItemMotion', 'list_item_motion'],
  ['loadingIdleEffects', 'loading_idle'],
  ['themeCrossfade', 'theme_crossfade'],
]) {
  $(`#${id}`).addEventListener('change', (event) => {
    void saveInterfaceMotion({
      ...interfaceMotion,
      [key]: event.currentTarget.checked,
    }).catch(() => {});
  });
}

$('#glassOpacity').addEventListener('input', (event) => {
  themePreferences.opacityOverrides[activeThemeId] = Number(event.currentTarget.value);
  applyTheme(root.dataset.theme);
  $('#glassOpacityValue').value = `${event.currentTarget.value}%`;
});

$('#glassOpacity').addEventListener('change', async () => {
  try {
    await persistThemePreferences();
  } catch (error) {
    themePreferences.opacityOverrides = structuredClone(savedThemePreferences.opacityOverrides);
    applyTheme(root.dataset.theme);
    toast(`Could not save theme opacity: ${error}`);
  }
});

async function customImageUrl(id) {
  if (customImageUrls.has(id)) return customImageUrls.get(id);
  const image = await invoke('get_custom_image', { id });
  const url = URL.createObjectURL(new Blob([new Uint8Array(image.bytes)], { type: image.mimeType }));
  const preview = new Image();
  try {
    await new Promise((resolve, reject) => {
      preview.onload = resolve;
      preview.onerror = () => reject(new Error('The image could not be decoded by Windows.'));
      preview.src = url;
    });
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  customImageUrls.set(id, url);
  return url;
}

async function setThemeDeskBackground(themeId) {
  const desk = $('#desk');
  const id = deskBackgroundId ?? themeById(themeId)?.background ?? null;
  if (id === renderedDeskBackgroundId || id === requestedDeskBackgroundId) return;
  const request = ++deskBackgroundRequest;
  requestedDeskBackgroundId = id;
  if (!id) {
    desk.style.backgroundImage = '';
    renderedDeskBackgroundId = null;
    requestedDeskBackgroundId = undefined;
    return;
  }
  try {
    const url = await customImageUrl(id);
    if (request !== deskBackgroundRequest) return;
    desk.style.backgroundImage =
      `linear-gradient(rgba(0, 0, 0, 0.14), rgba(0, 0, 0, 0.14)), url("${url}")`;
    renderedDeskBackgroundId = id;
  } finally {
    if (request === deskBackgroundRequest) requestedDeskBackgroundId = undefined;
  }
}

function releaseUnusedCustomImages() {
  const used = new Set(deskStickers.map((sticker) => sticker.id));
  if (deskBackgroundId) used.add(deskBackgroundId);
  for (const theme of allThemes()) {
    for (const id of themeAssetIds(theme)) used.add(id);
  }
  for (const [id, url] of customImageUrls) {
    if (used.has(id)) continue;
    URL.revokeObjectURL(url);
    customImageUrls.delete(id);
  }
}

async function renderDeskCustomization() {
  const desk = $('#desk');
  const backgroundButton = $('#clearDeskBackground');
  backgroundButton.disabled = !deskBackgroundId;
  const layer = $('#deskStickers');
  layer.replaceChildren();
  $('#clearDeskStickers').disabled = deskStickers.length === 0;
  await setThemeDeskBackground(activeThemeId);

  for (const stickerData of deskStickers) {
    const url = await customImageUrl(stickerData.id);
    const sticker = document.createElement('div');
    sticker.className = 'desk-sticker';
    sticker.dataset.stickerId = stickerData.id;
    sticker.setAttribute('role', 'group');
    sticker.setAttribute('aria-label', 'Desk sticker; drag to move and resize');
    Object.assign(sticker.style, {
      left: `${stickerData.x}%`,
      top: `${stickerData.y}%`,
      width: `${stickerData.width}%`,
      height: `${stickerData.height}%`,
    });
    const image = document.createElement('img');
    image.src = url;
    image.alt = 'Custom desk sticker';
    const remove = document.createElement('button');
    remove.className = 'sticker-remove';
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', 'Remove desk sticker');
    sticker.append(image, remove);
    layer.append(sticker);
    if (pendingStickerUnlocks.delete(stickerData.id) && optionalEffectsActive()) {
      void animateDeskItem(sticker).catch((error) => {
        toast(`Could not animate the new desk item: ${error}`);
      });
    }
  }
  releaseUnusedCustomImages();
}

async function storeCustomImage(path) {
  const id = await invoke('import_custom_image', { path });
  try {
    await customImageUrl(id);
    return id;
  } catch (error) {
    await invoke('remove_custom_image', { id });
    throw error;
  }
}

async function importCustomImage() {
  const path = await open({
    multiple: false,
    filters: [{ name: 'Desk images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  });
  return path ? storeCustomImage(path) : null;
}

async function setDeskBackground(id) {
  const previousId = deskBackgroundId;
  await invoke('set_desk_background', { id });
  deskBackgroundId = id;
  await renderDeskCustomization();
  if (previousId && previousId !== id
    && !deskStickers.some((sticker) => sticker.id === previousId)
    && !themeReferencesAsset(previousId)) {
    try {
      await invoke('remove_custom_image', { id: previousId });
      return null;
    } catch (error) {
      return error;
    }
  }
  return null;
}

$('#chooseDeskBackground').addEventListener('click', async () => {
  let importedId = null;
  try {
    importedId = await importCustomImage();
    if (!importedId) return;
    const cleanupError = await setDeskBackground(importedId);
    $('#deskCustomizationStatus').textContent = cleanupError
      ? `Background updated, but the unused previous image could not be removed: ${cleanupError}`
      : 'Desk background updated.';
  } catch (error) {
    if (importedId && importedId !== deskBackgroundId) {
      try {
        await invoke('remove_custom_image', { id: importedId });
      } catch (cleanupError) {
        console.error('Could not remove the unused imported background:', cleanupError);
      }
    }
    $('#deskCustomizationStatus').textContent = `Could not set desk background: ${error}`;
  }
});

$('#clearDeskBackground').addEventListener('click', async () => {
  try {
    const cleanupError = await setDeskBackground(null);
    $('#deskCustomizationStatus').textContent = cleanupError
      ? `Background cleared, but its old image could not be removed: ${cleanupError}`
      : 'Desk background cleared.';
  } catch (error) {
    $('#deskCustomizationStatus').textContent = `Could not clear desk background: ${error}`;
  }
});

$('#addDeskSticker').addEventListener('click', async () => {
  let importedId = null;
  try {
    if (deskStickers.length >= 12) throw new Error('The desk can contain no more than 12 stickers.');
    importedId = await importCustomImage();
    if (!importedId) return;
    const next = [...deskStickers, { id: importedId, x: 4, y: 5, width: 20, height: 75 }];
    await invoke('save_desk_stickers', { stickers: next });
    deskStickers = next;
    pendingStickerUnlocks.add(importedId);
    await renderDeskCustomization();
    $('#deskCustomizationStatus').textContent = 'Sticker added. Drag it to move; use its lower-right handle to resize.';
  } catch (error) {
    if (importedId && !deskStickers.some((sticker) => sticker.id === importedId)) {
      pendingStickerUnlocks.delete(importedId);
      try {
        await invoke('remove_custom_image', { id: importedId });
      } catch (cleanupError) {
        console.error('Could not remove the unused imported sticker:', cleanupError);
      }
    }
    $('#deskCustomizationStatus').textContent = `Could not add sticker: ${error}`;
  }
});

async function addDeskStickerFromPath(path, x, y) {
  if (deskStickers.length >= 12) throw new Error('The desk can contain no more than 12 stickers.');
  const id = await storeCustomImage(path);
  const next = [...deskStickers, { id, x, y, width: 20, height: 75 }];
  try {
    await invoke('save_desk_stickers', { stickers: next });
    deskStickers = next;
    pendingStickerUnlocks.add(id);
    await renderDeskCustomization();
  } catch (error) {
    pendingStickerUnlocks.delete(id);
    await invoke('remove_custom_image', { id });
    throw error;
  }
}

let unlistenDeskDrop = null;
try {
  getCurrentWebview().onDragDropEvent(async (event) => {
    const desk = $('#desk');
    const scale = devicePixelRatio > 0 ? devicePixelRatio : 1;
    const pointX = event.payload.position.x / scale;
    const pointY = event.payload.position.y / scale;
    const bounds = desk.getBoundingClientRect();
    const insideDesk = !desk.hidden && pointX >= bounds.left && pointX <= bounds.right
      && pointY >= bounds.top && pointY <= bounds.bottom;
    if (event.payload.type === 'leave') {
      desk.classList.remove('drag-over');
      return;
    }
    if (event.payload.type === 'enter' || event.payload.type === 'over') {
      desk.classList.toggle('drag-over', insideDesk);
      return;
    }
    desk.classList.remove('drag-over');
    if (event.payload.paths.length === 0 || !insideDesk) return;
    try {
      const x = Math.max(0, Math.min(80, ((pointX - bounds.left) / bounds.width) * 100 - 10));
      const y = Math.max(0, Math.min(20, ((pointY - bounds.top) / bounds.height) * 100 - 35));
      await addDeskStickerFromPath(event.payload.paths[0], x, y);
      $('#deskCustomizationStatus').textContent = 'Dropped image added as a sticker. Drag it to move or resize it.';
    } catch (error) {
      $('#deskCustomizationStatus').textContent = `Could not add dropped image: ${error}`;
    }
  }).then((unlisten) => {
    unlistenDeskDrop = unlisten;
  }).catch((error) => {
    console.error('Could not enable desk image drop:', error);
  });
} catch (error) {
  console.error('Could not access native desk image drop:', error);
}

$('#deskStickers').addEventListener('click', async (event) => {
  const button = event.target.closest('.sticker-remove');
  const sticker = button?.closest('.desk-sticker');
  if (!sticker) return;
  try {
    await animateDeskItem(sticker, 'remove');
  } catch (error) {
    toast(`Could not animate sticker removal: ${error}`);
  }
  const previous = deskStickers;
  const next = previous.filter((item) => item.id !== sticker.dataset.stickerId);
  try {
    await invoke('save_desk_stickers', { stickers: next });
    deskStickers = next;
    await renderDeskCustomization();
  } catch (error) {
    deskStickers = previous;
    await renderDeskCustomization();
    $('#deskCustomizationStatus').textContent = `Could not remove sticker: ${error}`;
    return;
  }
  try {
    if (!themeReferencesAsset(sticker.dataset.stickerId)) {
      await invoke('remove_custom_image', { id: sticker.dataset.stickerId });
    }
    $('#deskCustomizationStatus').textContent = 'Sticker removed.';
  } catch (error) {
    $('#deskCustomizationStatus').textContent = `Sticker removed, but its unused image could not be deleted: ${error}`;
  }
});

$('#clearDeskStickers').addEventListener('click', async () => {
  const previous = deskStickers;
  try {
    await invoke('save_desk_stickers', { stickers: [] });
  } catch (error) {
    $('#deskCustomizationStatus').textContent = `Could not clear stickers: ${error}`;
    return;
  }
  deskStickers = [];
  await renderDeskCustomization();
  const cleanupErrors = [];
  for (const sticker of previous) {
    if (themeReferencesAsset(sticker.id)) continue;
    try {
      await invoke('remove_custom_image', { id: sticker.id });
    } catch (error) {
      cleanupErrors.push(`${sticker.id}: ${error}`);
    }
  }
  $('#deskCustomizationStatus').textContent = cleanupErrors.length
    ? `Stickers cleared, but image cleanup failed: ${cleanupErrors.join('; ')}`
    : 'All stickers removed.';
});

let stickerDrag = null;
$('#deskStickers').addEventListener('pointerdown', (event) => {
  const element = event.target.closest('.desk-sticker');
  if (!element || event.target.closest('.sticker-remove')) return;
  const rect = element.getBoundingClientRect();
  const resizing = event.clientX >= rect.right - 16 && event.clientY >= rect.bottom - 16;
  if (resizing) return;
  const sticker = deskStickers.find((item) => item.id === element.dataset.stickerId);
  if (!sticker) return;
  stickerDrag = {
    element,
    id: sticker.id,
    pointerId: event.pointerId,
    originX: event.clientX,
    originY: event.clientY,
    x: sticker.x,
    y: sticker.y,
    bounds: $('#deskStickers').getBoundingClientRect(),
  };
  if (animationSettings.effects.stickerMotion && optionalEffectsActive()) element.classList.add('is-dragging');
  element.setPointerCapture(event.pointerId);
});

$('#deskStickers').addEventListener('pointermove', (event) => {
  if (!stickerDrag || stickerDrag.pointerId !== event.pointerId) return;
  const { bounds } = stickerDrag;
  const sticker = deskStickers.find((item) => item.id === stickerDrag.id);
  if (!sticker) return;
  sticker.x = Math.max(0, Math.min(100 - sticker.width,
    stickerDrag.x + ((event.clientX - stickerDrag.originX) / bounds.width) * 100));
  sticker.y = Math.max(0, Math.min(100 - sticker.height,
    stickerDrag.y + ((event.clientY - stickerDrag.originY) / bounds.height) * 100));
  stickerDrag.element.style.left = `${sticker.x}%`;
  stickerDrag.element.style.top = `${sticker.y}%`;
});

async function persistDeskStickerGeometry(element) {
  const bounds = $('#deskStickers').getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const sticker = deskStickers.find((item) => item.id === element.dataset.stickerId);
  if (!sticker || !bounds.width || !bounds.height) return;
  const previous = { ...sticker };
  sticker.x = Math.max(0, Math.min(100 - sticker.width, ((rect.left - bounds.left) / bounds.width) * 100));
  sticker.y = Math.max(0, Math.min(100 - sticker.height, ((rect.top - bounds.top) / bounds.height) * 100));
  sticker.width = Math.max(5, Math.min(100 - sticker.x, (rect.width / bounds.width) * 100));
  sticker.height = Math.max(5, Math.min(100 - sticker.y, (rect.height / bounds.height) * 100));
  try {
    await invoke('save_desk_stickers', { stickers: deskStickers });
    $('#deskCustomizationStatus').textContent = 'Sticker placement saved.';
  } catch (error) {
    Object.assign(sticker, previous);
    await renderDeskCustomization();
    $('#deskCustomizationStatus').textContent = `Could not save sticker placement: ${error}`;
  }
}

$('#deskStickers').addEventListener('pointerup', async (event) => {
  const element = event.target.closest('.desk-sticker');
  if (!element) return;
  const wasDragged = stickerDrag?.pointerId === event.pointerId;
  if (wasDragged) stickerDrag = null;
  element.classList.remove('is-dragging');
  if (wasDragged) {
    void animateDeskItem(element, 'sticker-drop').catch((error) => {
      toast(`Could not settle the desk item: ${error}`);
    });
  }
  await persistDeskStickerGeometry(element);
});

$('#deskStickers').addEventListener('pointercancel', () => {
  if (stickerDrag) {
    const sticker = deskStickers.find((item) => item.id === stickerDrag.id);
    if (sticker) {
      sticker.x = stickerDrag.x;
      sticker.y = stickerDrag.y;
      stickerDrag.element.style.left = `${sticker.x}%`;
      stickerDrag.element.style.top = `${sticker.y}%`;
      stickerDrag.element.classList.remove('is-dragging');
    }
  }
  stickerDrag = null;
});

window.addEventListener('pagehide', () => {
  for (const url of customImageUrls.values()) URL.revokeObjectURL(url);
  customImageUrls.clear();
  particlePool?.dispose();
  if (unlistenDeskDrop) unlistenDeskDrop();
}, { once: true });

const definitions = [
  { ...clipboard, load: () => import('./modules/clipboard/index.js') },
  { ...links, load: () => import('./modules/links/index.js') },
  { ...layouts, load: () => import('./modules/layouts/index.js') },
  { ...rename, load: () => import('./modules/rename/index.js') },
  { ...breakBuddy, load: () => import('./modules/break/index.js') },
  { ...colorPicker, load: () => import('./modules/color-picker/index.js') },
  { ...keepAwake, load: () => import('./modules/keep-awake/index.js') },
  { ...pinWindow, load: () => import('./modules/pin-window/index.js') },
  { ...notes, load: () => import('./modules/notes/index.js') },
  { ...focus, load: () => import('./modules/focus/index.js') },
  { ...tidyDownloads, load: () => import('./modules/tidy-downloads/index.js') },
  { ...scenes, load: () => import('./modules/scenes/index.js') },
];

let registry;
let moduleContext;
let buddyMode = 'desk';

function requestPermission(title, explanation) {
  const dialog = $('#permissionDialog');
  $('#permissionDialogTitle').textContent = title;
  $('#permissionDialogText').textContent = explanation;
  return new Promise((resolve, reject) => {
    const onClose = () => resolve(dialog.returnValue === 'allow');
    dialog.addEventListener('close', onClose, { once: true });
    try {
      dialog.showModal();
    } catch (error) {
      dialog.removeEventListener('close', onClose);
      reject(error);
    }
  });
}

function optionalEffectsActive(enabled = true) {
  const policy = motionEngine.getPolicy();
  return optionalMotionAllowed({
    enabled: enabled && root.dataset.theme !== 'glass' && motionEngine.canAnimate('ui'),
    reducedMotion: policy.reducedMotion,
    ecoMode: policy.ecoMode,
    visible: policy.visible,
    glass: root.dataset.theme === 'glass',
  });
}

function emitDeskParticles(kind, clientX, clientY) {
  if (!animationSettings.effects.particles
    || !optionalEffectsActive()
    || ![clientX, clientY].every(Number.isFinite)) return;
  const canvas = $('#deskParticles');
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return;
  try {
    particlePool ??= createParticlePool({
      canvas,
      motion: motionEngine,
      getColor(name) {
        return getComputedStyle(root).getPropertyValue(`--${name}`).trim() || 'currentColor';
      },
    });
    particlePool.emit(kind, clientX - bounds.left, clientY - bounds.top);
  } catch (error) {
    toast(`Could not show the desk effect: ${error}`);
  }
}

function supportsBuddyTransition(transition) {
  if (!animationSettings.effects.buddyTransitions) return false;
  const supported = buddyMotionMetadata?.supportedTransitions;
  return !supported || supported.includes(transition);
}

function buddyTransitionDuration(type, fallback) {
  const value = buddyMotionMetadata?.timings?.[`${type}Ms`];
  return Number.isInteger(value) ? value : fallback;
}

function animateDeskItem(element, kind = 'unlock') {
  const transition = ['unlock', 'sticker-drop'].includes(kind) ? kind : null;
  if (!animationSettings.effects.stickerMotion
    || !optionalEffectsActive()
    || (transition && !supportsBuddyTransition(transition))) return Promise.resolve(false);
  const previousCancel = deskItemAnimations.get(element);
  previousCancel?.();
  const duration = buddyTransitionDuration(kind === 'unlock' ? 'unlock' : 'impact', 220);
  const startScale = kind === 'unlock' ? 0.72 : kind === 'remove' ? 1 : 0.88;
  const endScale = kind === 'remove' ? 0.68 : 1;
  const spring = createConfiguredSpring({
    preset: 'Lively',
    stiffness: clampMotion(1000 * (220 / Math.max(100, duration)) ** 2, 250, 1000),
    position: startScale,
    target: endScale,
    minimum: 0.6,
    maximum: 1.08,
  });
  const startRotation = kind === 'sticker-drop' ? -7 : 0;
  const rotation = createConfiguredSpring({
    preset: 'Default',
    position: startRotation,
    target: 0,
    minimum: -8,
    maximum: 8,
  });
  element.style.setProperty('--desk-item-scale', String(startScale));
  element.style.setProperty('--desk-item-opacity', kind === 'unlock' ? '0' : '1');
  element.style.setProperty('--desk-item-rotation', `${startRotation}deg`);
  let cancel = null;
  return new Promise((resolve, reject) => {
    try {
      cancel = motionEngine.register({
        id: `desk-item-${++nextDeskItemAnimation}`,
        kind: 'ui',
        element,
        onStop(reason) {
          element.style.removeProperty('--desk-item-scale');
          element.style.removeProperty('--desk-item-opacity');
          element.style.removeProperty('--desk-item-rotation');
          if (deskItemAnimations.get(element) === cancel) deskItemAnimations.delete(element);
          resolve(reason === 'completed');
        },
        update({ deltaSeconds }) {
          const value = spring.advance(deltaSeconds);
          const angle = rotation.advance(deltaSeconds);
          const progress = clampMotion(
            (value.position - startScale) / (endScale - startScale),
            0,
            1,
          );
          element.style.setProperty('--desk-item-scale', String(value.position));
          element.style.setProperty('--desk-item-opacity', String(
            kind === 'remove' ? 1 - progress : kind === 'unlock' ? progress : 1,
          ));
          element.style.setProperty('--desk-item-rotation', `${angle.position}deg`);
          return !(value.settled && angle.settled);
        },
      });
      deskItemAnimations.set(element, cancel);
    } catch (error) {
      reject(error);
    }
  });
}

function applyInterfaceMotion(settings) {
  interfaceMotion = normalizeInterfaceMotion(settings);
  root.dataset.drawerStyle = interfaceMotion.drawer_style;
  root.dataset.loadingIdle = String(interfaceMotion.loading_idle);
  $('#drawerStyle').value = interfaceMotion.drawer_style;
  $('#dockMagnification').checked = interfaceMotion.dock_magnification;
  $('#rubberBandScrolling').checked = interfaceMotion.rubber_band;
  $('#cursorTilt').checked = interfaceMotion.cursor_tilt;
  $('#reminderBounce').checked = interfaceMotion.reminder_bounce;
  $('#taskbarFlash').checked = interfaceMotion.taskbar_flash;
  $('#loadingIdleEffects').checked = interfaceMotion.loading_idle;
  $('#themeCrossfade').checked = interfaceMotion.theme_crossfade;
  if (!interfaceMotion.dock_magnification) resetDockMagnification();
  if (!interfaceMotion.cursor_tilt) $('#desk').style.rotate = '';
  if (!interfaceMotion.list_item_motion) cancelListExitAnimations();
  if (!interfaceMotion.rubber_band) {
    for (const animation of rubberBandAnimations.values()) animation.cancel();
  }
}

async function saveInterfaceMotion(settings) {
  const previous = interfaceMotion;
  const next = normalizeInterfaceMotion(settings);
  applyInterfaceMotion(next);
  try {
    await invoke('set_interface_motion', { settings: next });
  } catch (error) {
    applyInterfaceMotion(previous);
    toast(`Could not save animation settings: ${error}`);
    throw error;
  }
}

function panelContent(panel) {
  let content = [...panel.children].find((child) => child.classList.contains('panel-content'));
  if (!content) {
    content = document.createElement('div');
    content.className = 'panel-content';
    while (panel.firstChild) content.append(panel.firstChild);
    panel.append(content);
  }
  if (panel.dataset.rubberBandReady) return content;
  panel.dataset.rubberBandReady = 'true';
  panel.addEventListener('wheel', (event) => {
    if (!interfaceMotionReady || !interfaceMotion.rubber_band
      || !optionalEffectsActive() || event.deltaY === 0
      || event.target.closest('input, textarea, select, [contenteditable="true"]')
      || panel.scrollHeight <= panel.clientHeight + 1) return;
    const atTop = panel.scrollTop <= 0 && event.deltaY < 0;
    const atBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1
      && event.deltaY > 0;
    if (!atTop && !atBottom) return;
    event.preventDefault();
    let animation = rubberBandAnimations.get(panel);
    if (!animation) {
      const spring = createConfiguredSpring({
        preset: 'Default',
        stiffness: 720,
        damping: 42,
        mass: 0.6,
        minimum: -12,
        maximum: 12,
        velocity: clampMotion(-event.deltaY * 0.15, -80, 80),
      });
      animation = { spring, cancel: null, content };
      rubberBandAnimations.set(panel, animation);
      content.classList.add('is-rubber-banding');
      animation.cancel = motionEngine.register({
        id: `panel-rubber-band-${panel.id}`,
        kind: 'ui',
        element: content,
        onStop() {
          if (rubberBandAnimations.get(panel) !== animation) return;
          content.style.removeProperty('--rubber-band-offset');
          content.classList.remove('is-rubber-banding');
          rubberBandAnimations.delete(panel);
        },
        update({ deltaSeconds }) {
          const value = spring.advance(deltaSeconds);
          content.style.setProperty('--rubber-band-offset', `${value.position}px`);
          return !value.settled;
        },
      });
    } else {
      animation.spring.setTarget(clampMotion(
        animation.spring.snapshot().position - event.deltaY * 0.08,
        -12,
        12,
      ));
    }
  }, { passive: false });
  return content;
}

function cancelListExitAnimations() {
  for (const cancel of listExitAnimations.values()) cancel();
}

function animateListExitItems(list, retainedKeys = []) {
  const panel = list.closest('.panel');
  if (!interfaceMotion.list_item_motion
    || !optionalEffectsActive()
    || root.dataset.theme === 'glass'
    || !panel
    || panel.hidden
    || list.getClientRects().length === 0) return;

  const panelBounds = panel.getBoundingClientRect();
  const retained = new Set(retainedKeys);
  const rows = [...list.children]
    .filter((child) => child.tagName === 'LI' && !retained.has(child.dataset.motionKey))
    .slice(0, 8 - listExitAnimations.size);
  if (rows.length === 0) return;
  for (const row of rows) {
    const bounds = row.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0
      || bounds.bottom <= panelBounds.top || bounds.top >= panelBounds.bottom
      || bounds.bottom <= 0 || bounds.top >= innerHeight) continue;

    const overlay = document.createElement('ul');
    overlay.className = `${list.className} list-exit-overlay`;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('role', 'presentation');
    overlay.inert = true;
    const clone = row.cloneNode(true);
    clone.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
    overlay.append(clone);
    Object.assign(overlay.style, {
      position: 'fixed',
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
      width: `${bounds.width}px`,
      margin: '0',
      padding: '0',
      zIndex: '2000',
      pointerEvents: 'none',
      clipPath: `inset(${Math.max(0, panelBounds.top - bounds.top)}px 0 ${Math.max(0, bounds.bottom - panelBounds.bottom)}px 0)`,
      opacity: '1',
      transform: 'translate3d(0, 0, 0)',
    });
    document.body.append(overlay);

    let elapsed = 0;
    const id = `list-item-exit-${++nextListExitAnimation}`;
    try {
      const cancel = motionEngine.register({
        id,
        kind: 'ui',
        element: overlay,
        onStop() {
          overlay.remove();
          listExitAnimations.delete(id);
        },
        update({ deltaSeconds }) {
          elapsed += deltaSeconds;
          const progress = Math.min(1, elapsed / 0.14);
          overlay.style.opacity = String(1 - progress);
          overlay.style.transform = `translate3d(0, ${8 * progress}px, 0)`;
          return progress < 1;
        },
      });
      listExitAnimations.set(id, cancel);
    } catch (error) {
      overlay.remove();
      toast(`Could not animate a list update: ${error}`);
    }
  }
}

function resetDockMagnification() {
  document.querySelectorAll('.drawer').forEach((tab) => {
    tab.style.setProperty('--dock-scale', '1');
  });
}

function openDrawer(id) {
  const module = registry?.list().find((item) => item.panelId === `p-${id}`);
  if (module && !module.enabled) {
    toast(`${module.name} is turned off. Enable it on the Modules page.`);
    return;
  }
  const previous = document.querySelector('.drawer[aria-selected="true"]')?.dataset.p;
  document.querySelectorAll('.drawer').forEach((tab) => {
    tab.setAttribute('aria-selected', String(tab.dataset.p === id));
  });
  document.querySelectorAll('.panel').forEach((panel) => {
    if (panel.id !== `p-${id}`) {
      rubberBandAnimations.get(panel)?.cancel();
      panelContent(panel).style.removeProperty('--rubber-band-offset');
    }
    panel.hidden = panel.id !== `p-${id}`;
    if (!panel.hidden) panelContent(panel);
  });
  if (previous && previous !== id && optionalEffectsActive(interfaceMotionReady)) {
    const tabs = $('#moduleTabs');
    tabs.classList.add('is-pulling');
    clearTimeout(drawerNudgeTimer);
    drawerNudgeTimer = setTimeout(() => tabs.classList.remove('is-pulling'), 130);
  }
  resetDockMagnification();
  const buddy = $('#buddyWrap');
  buddy?.classList.remove('hop');
  if (buddy) {
    void buddy.offsetWidth;
    buddy.classList.add('hop');
  }
}

function renderRegistry(modules) {
  const selected = document.querySelector('.drawer[aria-selected="true"]')?.dataset.p;
  const tabs = $('#moduleTabs');
  tabs.replaceChildren();
  const panelIds = new Set(modules.map((module) => module.panelId));
  for (const module of modules.filter((item) => item.enabled)) {
    const button = document.createElement('button');
    button.className = 'drawer';
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.dataset.p = module.panelId.slice(2);
    button.dataset.key = module.key ?? '';
    button.setAttribute('aria-selected', 'false');
    const icon = document.createElement('span');
    icon.className = 'module-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = module.icon;
    button.append(icon, document.createTextNode(module.name));
    const shortcut = document.createElement('small');
    shortcut.textContent = module.key ? `press ${module.key}` : 'open from Modules';
    button.append(shortcut);
    tabs.append(button);
  }
  for (const [id, name, key] of [
    ['modules', 'Modules', 'm'],
    ['settings', 'Settings', 's'],
    ['behavior', 'Behavior Lab', 'b'],
  ]) {
    const button = document.createElement('button');
    button.className = 'drawer';
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.dataset.p = id;
    button.dataset.key = key;
    button.setAttribute('aria-selected', 'false');
    button.append(document.createTextNode(name));
    const shortcut = document.createElement('small');
    shortcut.textContent = `press ${key}`;
    button.append(shortcut);
    tabs.append(button);
  }

  for (const panel of document.querySelectorAll('.panel')) {
    if (panelIds.has(panel.id)) panel.hidden = true;
  }
  $('#desk').hidden = buddyMode === 'off'
    || buddyMode === 'roam'
    || !modules.some((module) => module.id === 'break' && module.enabled);

  const list = $('#moduleList');
  list.replaceChildren();
  for (const module of modules) {
    const label = document.createElement('label');
    label.className = 'setting';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = module.enabled;
    toggle.disabled = !moduleContext;
    toggle.dataset.module = module.id;
    toggle.setAttribute('aria-label', `Enable ${module.name}`);
    const text = document.createElement('span');
    const name = document.createElement('strong');
    const icon = document.createElement('span');
    icon.className = 'module-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = module.icon;
    name.append(icon, document.createTextNode(module.name));
    const description = document.createElement('small');
    description.textContent = module.description;
    text.append(name, description);
    label.append(toggle, text);
    toggle.addEventListener('change', async () => {
      toggle.disabled = true;
      try {
        if (toggle.checked) {
          const approved = await requestPermission(
            `Enable ${module.name}?`,
            `${module.description} This module starts only after you choose Enable. You can turn it off again in Modules.`,
          );
          if (!approved) {
            toggle.checked = false;
            return;
          }
        }
        await registry.setEnabled(module.id, toggle.checked, moduleContext);
      } catch (error) {
        toggle.checked = !toggle.checked;
        toast(`Could not change ${module.name}: ${error}`);
      } finally {
        toggle.disabled = false;
      }
    });
    list.append(label);
  }
  if (selected === 'modules' || selected === 'settings' || selected === 'behavior') {
    openDrawer(selected);
  } else if (modules.some((module) => module.enabled && module.panelId === `p-${selected}`)) {
    openDrawer(selected);
  } else {
    openDrawer('modules');
  }
}

$('#moduleTabs').addEventListener('click', (event) => {
  const tab = event.target.closest('.drawer');
  if (tab) openDrawer(tab.dataset.p);
});

$('#moduleTabs').addEventListener('pointermove', (event) => {
  if (!interfaceMotionReady || !interfaceMotion.dock_magnification || !optionalEffectsActive()) {
    resetDockMagnification();
    return;
  }
  document.querySelectorAll('.drawer').forEach((tab) => {
    const rect = tab.getBoundingClientRect();
    tab.style.setProperty('--dock-scale', String(dockMagnification(
      event.clientX - (rect.left + rect.width / 2),
      82,
      1.35,
    )));
  });
});
$('#moduleTabs').addEventListener('pointerleave', resetDockMagnification);

$('#desk').addEventListener('pointermove', (event) => {
  if (!interfaceMotionReady || windowStyle !== 'soft'
    || !interfaceMotion.cursor_tilt || !optionalEffectsActive()) {
    $('#desk').style.rotate = '';
    return;
  }
  const desk = $('#desk');
  const tilt = cursorTiltFromPoint(event.clientX, event.clientY, desk.getBoundingClientRect());
  const magnitude = Math.hypot(tilt.x, tilt.y);
  if (magnitude === 0) {
    desk.style.rotate = '';
    return;
  }
  const angle = Math.min(3, magnitude);
  desk.style.rotate = `${tilt.y / magnitude} ${tilt.x / magnitude} 0 ${angle}deg`;
});
$('#desk').addEventListener('pointerleave', () => {
  $('#desk').style.rotate = '';
});

addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openCommandPalette();
    return;
  }
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key;
  const target = key.toLowerCase() === 'm'
    ? 'modules'
    : key.toLowerCase() === 's'
      ? 'settings'
      : key.toLowerCase() === 'b'
        ? 'behavior'
        : definitions.find((item) => item.key === key)?.panelId.slice(2);
  if (target) openDrawer(target);
});

const packEditor = $('#packJson');
const packStatus = $('#packValidation');
const installedPacks = $('#installedPacks');
const installedPacksStatus = $('#installedPacksStatus');
const behaviorRules = $('#behaviorRules');
const samplePacks = { 'sleepy-cat': sleepyCatPack, 'curious-fox': curiousFoxPack };
const SENSOR_OPTIONS = [
  ['clipboard', 'Clipboard kind', 'Only coarse text, link, or color kind metadata; never clipboard contents.'],
  ['files', 'File changes', 'A rename completed and the number of files changed.'],
  ['breaks', 'Break activity', 'A break reminder was dismissed or completed.'],
  ['cursor', 'Cursor movement', 'Local pointer coordinates for the in-window preview and optional desktop roaming; never stored or shared.'],
];

const COMMAND_ACTIONS = [
  { id: 'action-open-settings', name: 'Open Settings', description: 'Go to app settings.', target: 'panel:settings' },
  { id: 'action-open-modules', name: 'Open Modules', description: 'Enable or disable toolbox modules.', target: 'panel:modules' },
  { id: 'action-open-behavior', name: 'Open Behavior Lab', description: 'Edit buddy rules, sensors, and packs.', target: 'panel:behavior' },
  { id: 'action-open-clipboard', name: 'Open Clipboard', description: 'Browse saved clipboard history.', target: 'panel:clip' },
];

function commandPaletteActions() {
  return [...COMMAND_ACTIONS, ...themePaletteEntries(allThemes())];
}

function settingsEntries() {
  return [
    ...SETTINGS_CATALOG,
    ...definitions.map((module) => ({
      id: `module-${module.id}`,
      section: 'modules',
      name: module.name,
      description: `${module.description} Starts off on a new install and asks before it is enabled.`,
      target: `module:${module.id}`,
    })),
    ...SENSOR_OPTIONS.map(([id, name, description]) => ({
      id: `sensor-${id}`,
      section: 'privacy',
      name,
      description: `${description} Ask before enabling this buddy sensor.`,
      target: `sensor:${id}`,
    })),
  ];
}

function selectSettingsSection(section) {
  if (section === 'developer' && !developerMode) {
    throw new Error('Developer mode is turned off.');
  }
  const known = SETTINGS_SECTIONS.some((item) => item.id === section);
  if (!known) throw new Error(`Unknown settings section: ${section}`);
  for (const tab of document.querySelectorAll('[data-settings-section]')) {
    const selected = tab.dataset.settingsSection === section;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const page of document.querySelectorAll('[data-settings-page]')) {
    page.hidden = page.dataset.settingsPage !== section;
  }
}

selectSettingsSection('general');

$('#settingsNav').addEventListener('keydown', (event) => {
  const tabs = [...document.querySelectorAll('[data-settings-section]')];
  const current = tabs.indexOf(event.target.closest('[data-settings-section]'));
  if (current < 0) return;
  let next = current;
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (current + 1) % tabs.length;
  else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (current + tabs.length - 1) % tabs.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = tabs.length - 1;
  else return;
  event.preventDefault();
  selectSettingsSection(tabs[next].dataset.settingsSection);
  tabs[next].focus();
});

function showSettingsEntry(entry) {
  if (entry.target?.startsWith('theme:')) {
    void setTheme(entry.target.slice('theme:'.length));
    return;
  }
  if (entry.target?.startsWith('panel:')) {
    const panel = entry.target.slice('panel:'.length);
    openDrawer(panel);
    return;
  }
  openDrawer('settings');
  selectSettingsSection(entry.section);
  if (entry.target === 'openBehaviorLab') {
    openDrawer('behavior');
    return;
  }
  if (entry.target === 'openBehaviorSensors') {
    openDrawer('behavior');
    document.querySelector('[data-behavior-tab="sensors"]')?.click();
    return;
  }
  if (entry.target?.startsWith('module:')) {
    openDrawer('modules');
    const control = document.querySelector(`[data-module="${CSS.escape(entry.target.slice(7))}"]`);
    control?.scrollIntoView({ block: 'center' });
    control?.focus();
    return;
  }
  if (entry.target?.startsWith('sensor:')) {
    openDrawer('behavior');
    document.querySelector('[data-behavior-tab="sensors"]')?.click();
    const control = document.querySelector(`[data-sensor="${CSS.escape(entry.target.slice(7))}"]`);
    control?.scrollIntoView({ block: 'center' });
    control?.focus();
    return;
  }
  if (entry.target) {
    const control = document.getElementById(entry.target);
    if (entry.target === 'glassOpacity' && control?.disabled) {
      $('#glassOpacitySetting').scrollIntoView({ block: 'center' });
      $('#settingsTheme').focus();
      return;
    }
    control?.scrollIntoView({ block: 'center' });
    control?.focus();
  } else {
    document.querySelector(`[data-settings-section="${entry.section}"]`)?.focus();
  }
}

function renderSearchResults(query, container, { includeActions = false } = {}) {
  container.replaceChildren();
  const actions = includeActions ? commandPaletteActions() : [];
  const entries = includeActions ? [...settingsEntries(), ...actions] : settingsEntries();
  const matches = query.trim()
    ? searchSettings(entries, query)
    : actions;
  for (const entry of matches.slice(0, 12)) {
    const button = document.createElement('button');
    button.className = 'settings-search-result';
    button.type = 'button';
    const title = document.createElement('strong');
    title.textContent = entry.name;
    const description = document.createElement('small');
    description.textContent = entry.description;
    button.append(title, description);
    button.addEventListener('click', () => {
      if (includeActions) $('#commandPalette').close();
      showSettingsEntry(entry);
    });
    container.append(button);
  }
  return matches.length;
}

$('#settingsNav').addEventListener('click', (event) => {
  const tab = event.target.closest('[data-settings-section]');
  if (tab) selectSettingsSection(tab.dataset.settingsSection);
});

$('#settingsSearch').addEventListener('input', (event) => {
  const query = event.currentTarget.value.trim();
  const results = $('#settingsSearchResults');
  const count = renderSearchResults(query, results);
  results.hidden = query.length === 0;
  $('#settingsSearchStatus').textContent = query
    ? count ? `${count} matching settings.` : 'No settings match that search.'
    : '';
});

$('#commandSearch').addEventListener('input', (event) => {
  renderSearchResults(event.currentTarget.value, $('#commandResults'), { includeActions: true });
});

function openCommandPalette() {
  const dialog = $('#commandPalette');
  if (!dialog.open) dialog.showModal();
  $('#commandSearch').value = '';
  renderSearchResults('', $('#commandResults'), { includeActions: true });
  $('#commandSearch').focus();
}

$('#commandSearch').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    $('#commandResults').querySelector('button')?.click();
  }
});

$('#settingsSearch').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    $('#settingsSearchResults').querySelector('button')?.click();
  }
});

document.querySelectorAll('[data-open-panel]').forEach((button) => {
  button.addEventListener('click', () => {
    openDrawer(button.dataset.openPanel);
    if (button.dataset.openBehaviorTab) {
      document.querySelector(`[data-behavior-tab="${button.dataset.openBehaviorTab}"]`)?.click();
    }
  });
});

async function resetSettingsSection(section) {
  if (!moduleContext) throw new Error('Settings are still loading. Try again in a moment.');
  if (section === 'general') {
    await invoke('set_close_to_tray', { closeToTray: true });
    $('#closeToTray').checked = true;
    if ($('#launchAtLogin').checked) await disable();
    $('#launchAtLogin').checked = false;
  } else if (section === 'appearance') {
    await changeWindowStyle('native');
    $('#windowStyle').value = 'native';
    await invoke('set_theme', { theme: 'night', effect: 'none' });
    themePreferences = migrateThemePreferences({
      ...DEFAULT_THEME_PREFERENCES,
      customThemes: userThemes.map((theme) => serializeThemeFile(theme)),
    });
    await persistThemePreferences();
    renderThemePreferenceControls();
    applyTheme('night');
  } else if (section === 'buddy') {
    await invoke('set_buddy_mode', { mode: 'desk' });
    buddyMode = 'desk';
    $('#buddyMode').value = 'desk';
    renderRegistry(registry.list());
  } else if (section === 'animations') {
    await resetAnimationSettings();
  } else if (section === 'modules' || section === 'privacy') {
    if (section === 'privacy') {
      for (const [id] of SENSOR_OPTIONS) {
        if (currentBuddySensors[id]) {
          await invoke('set_buddy_sensor_enabled', { id, enabled: false });
          currentBuddySensors[id] = false;
        }
      }
      moduleContext.buddySensors = { ...currentBuddySensors };
      renderSensors(currentBuddySensors);
    }
    for (const module of registry.list()) {
      if (module.enabled) await registry.setEnabled(module.id, false, moduleContext);
    }
  } else if (section === 'behavior') {
    const rules = structuredClone(DEFAULT_PACK.rules);
    await invoke('save_buddy_rules', { rules });
    currentBuddyRules = rules;
    moduleContext.buddyRules = rules;
    eventBus.emit('buddy.rules.changed', { rules });
    setPackObject({ ...structuredClone(DEFAULT_PACK), rules }, { recordUndo: false });
  } else {
    return;
  }
  toast(`${SETTINGS_SECTIONS.find((item) => item.id === section)?.label ?? 'Settings'} restored to defaults.`);
}

document.querySelectorAll('[data-reset-settings]').forEach((button) => {
  button.addEventListener('click', async () => {
    const section = button.dataset.resetSettings;
    button.disabled = true;
    try {
      await resetSettingsSection(section);
    } catch (error) {
      toast(`Could not reset ${section} settings: ${error}`);
    } finally {
      button.disabled = false;
    }
  });
});

function updateDeveloperVisibility(enabled) {
  developerMode = enabled;
  $('#developerMode').checked = enabled;
  $('#developerSlowMotion').disabled = !enabled;
  $('#developerMotionOverlayToggle').disabled = !enabled;
  if (!enabled) {
    $('#developerMotionOverlayToggle').checked = false;
    $('#motionDebugOverlay').hidden = true;
    cancelDeveloperSpritePreview?.();
    cancelDeveloperSpritePreview = null;
  }
  applyAnimationSettings(animationSettings);
  clearInterval(developerMotionTimer);
  developerMotionTimer = enabled ? setInterval(renderMotionDiagnostics, 500) : null;
  if (enabled) renderMotionDiagnostics();
  let tab = $('#settings-tab-developer');
  if (enabled && !tab) {
    tab = document.createElement('button');
    tab.className = 'settings-nav-item';
    tab.type = 'button';
    tab.id = 'settings-tab-developer';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', 'settings-page-developer');
    tab.setAttribute('aria-selected', 'false');
    tab.dataset.settingsSection = 'developer';
    tab.textContent = 'Developer';
    $('#settingsNav').append(tab);
  } else if (!enabled && tab) {
    if (document.querySelector('[data-settings-page="developer"]:not([hidden])')) {
      selectSettingsSection('advanced');
    }
    tab.remove();
    $('#settings-page-developer').hidden = true;
  }
  if (enabled) {
    for (const tabItem of document.querySelectorAll('[data-settings-section]')) {
      tabItem.tabIndex = tabItem.getAttribute('aria-selected') === 'true' ? 0 : -1;
    }
    eventBus.emit('buddy.developer.snapshot.request', {});
    renderDeveloperFeatures();
    void refreshDeveloperSpritePacks().catch((error) => {
      $('#developerSpriteStatus').textContent = `Could not load sprite viewer packs: ${error}`;
    });
  }
}

$('#developerMode').addEventListener('change', async (event) => {
  const enabled = event.currentTarget.checked;
  try {
    await invoke('set_developer_mode', { enabled });
    updateDeveloperVisibility(enabled);
    eventBus.emit('buddy.developer.mode', { enabled });
    if (!enabled && developerPerformanceTimer) {
      clearTimeout(developerPerformanceTimer);
      developerPerformanceTimer = null;
      $('#developerPerformance').textContent = 'Performance sampling is off.';
      $('#developerPerformanceEnabled').checked = false;
    }
  } catch (error) {
    event.currentTarget.checked = !enabled;
    toast(`Could not change Developer mode: ${error}`);
  }
});

function renderDeveloperEvents() {
  const select = $('#developerEventName');
  const currentName = select.value;
  const names = [...new Set(developerEvents.map((entry) => entry.name))].sort();
  select.replaceChildren(new Option('All events', ''));
  for (const name of names) select.append(new Option(name, name));
  if (names.includes(currentName)) select.value = currentName;

  const entries = filterInspectorEvents(developerEvents, {
    query: $('#developerEventFilter').value,
    eventName: select.value,
  });
  const list = $('#developerEvents');
  list.replaceChildren();
  if (entries.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = developerEvents.length ? 'No events match this filter.' : 'No events captured yet.';
    list.append(empty);
    return;
  }
  for (const entry of entries.slice(-100).reverse()) {
    const item = document.createElement('li');
    const time = new Date(entry.time).toLocaleTimeString();
    item.textContent = `${time} · ${entry.name} · ${JSON.stringify(entry.payload)}`;
    list.append(item);
  }
}

function renderDeveloperRuleTraces() {
  const list = $('#developerRuleTraces');
  list.replaceChildren();
  if (developerRuleTraces.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No rule decisions captured yet. Fire a test event while the Break Buddy is enabled.';
    list.append(empty);
    return;
  }
  for (const trace of developerRuleTraces.slice(-100).reverse()) {
    const item = document.createElement('li');
    const summary = document.createElement('strong');
    summary.textContent = `${trace.eventName}: ${trace.selectedRuleId ? `matched ${trace.selectedRuleId}` : 'no rule matched'}`;
    const detail = document.createElement('small');
    detail.textContent = trace.outcomes.map((outcome) =>
      `${outcome.name}: ${outcome.result} (${outcome.reason})`).join(' · ') || 'No configured rules.';
    item.append(summary, detail);
    list.append(item);
  }
}

eventBus.onAny((name, payload) => {
  if (name.startsWith('buddy.developer.')) {
    if (name === 'buddy.developer.snapshot') {
      const snapshot = summarizeInspectorPayload(payload);
      $('#developerBuddySnapshot').textContent = Object.keys(snapshot).length
          ? `State: ${snapshot.state ?? 'unknown'} · Mood: ${snapshot.energy ?? '?'} energy, ${snapshot.mood ?? '?'} mood, ${snapshot.curiosity ?? '?'} curiosity · Buddy draw rate: ${snapshot.fps ?? '?'} FPS · Sensors: ${snapshot.sensors ?? 'unknown'}`
        : 'Waiting for the Break Buddy module.';
    }
    if (name === 'buddy.developer.rule-trace') {
      developerRuleTraces.push({ ...payload, time: Date.now() });
      if (developerRuleTraces.length > 200) developerRuleTraces.shift();
      renderDeveloperRuleTraces();
      void invoke('append_developer_log', {
        entry: JSON.stringify({ time: new Date().toISOString(), type: 'rule-trace', ...payload }),
      }).catch((error) => toast(`Could not append the local developer log: ${error}`));
    }
    return;
  }
  if (!developerMode) return;
  const event = {
    name,
    time: Date.now(),
    payload: summarizeInspectorPayload(payload),
  };
  developerEvents.push(event);
  if (developerEvents.length > 200) developerEvents.shift();
  renderDeveloperEvents();
  void invoke('append_developer_log', {
    entry: JSON.stringify({ time: new Date(event.time).toISOString(), type: 'event', ...event }),
  }).catch((error) => toast(`Could not append the local developer log: ${error}`));
});

$('#developerEventFilter').addEventListener('input', renderDeveloperEvents);
$('#developerEventName').addEventListener('change', renderDeveloperEvents);
$('#clearDeveloperEvents').addEventListener('click', () => {
  developerEvents.length = 0;
  renderDeveloperEvents();
});
document.querySelectorAll('[data-fire-event]').forEach((button) => {
  button.addEventListener('click', () => {
    const name = button.dataset.fireEvent;
    const payload = name === 'clipboard.copied' ? { kind: 'link' } : { count: 2 };
    eventBus.emit(name, payload);
  });
});

$('#applyDeveloperState').addEventListener('click', () => {
  const state = $('#developerForceState').value;
  if (BUDDY_STATES.includes(state)) eventBus.emit('buddy.developer.force-state', { state });
});
$('#applyDeveloperClock').addEventListener('click', () => {
  const hour = Number($('#developerClockHour').value);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    toast('Choose a clock hour from 0 to 23.');
    return;
  }
  developerClockHour = hour;
  eventBus.emit('buddy.developer.clock', { hour });
});
$('#clearDeveloperClock').addEventListener('click', () => {
  developerClockHour = null;
  $('#developerClockHour').value = '';
  eventBus.emit('buddy.developer.clock', { hour: null });
});

$('#developerValidatePack').addEventListener('click', () => {
  try {
    const pack = validatePackEditor();
    if (!pack) throw new Error('The current pack manifest is invalid.');
    $('#developerPackStatus').textContent = `Valid: ${pack.name}, ${pack.rules.length} rules. Pack data was validated; no pack code is executed.`;
  } catch (error) {
    $('#developerPackStatus').textContent = `Validation failed: ${error.message}`;
  }
});
$('#developerReloadPacks').addEventListener('click', async () => {
  $('#developerPackStatus').textContent = 'Reloading installed packs…';
  try {
    await refreshInstalledPacks();
    $('#developerPackStatus').textContent = installedPacksStatus.textContent;
  } catch (error) {
    $('#developerPackStatus').textContent = `Could not reload packs: ${error}`;
  }
});

function renderDeveloperFeatures() {
  const list = $('#developerFeatures');
  list.replaceChildren();
  for (const feature of [
    ['Remote update checks', 'Not implemented; this build makes no update requests.'],
    ['Telemetry', 'Unavailable; no telemetry or analytics are included.'],
    ['WebView DevTools', import.meta.env.DEV ? 'Available in this development build.' : 'Disabled in release builds.'],
  ]) {
    const item = document.createElement('li');
    item.textContent = `${feature[0]}: ${feature[1]}`;
    list.append(item);
  }
}

async function refreshDeveloperLog() {
  try {
    $('#developerLog').value = await invoke('read_developer_log');
  } catch (error) {
    toast(`Could not read the local developer log: ${error}`);
  }
}

$('#refreshDeveloperLog').addEventListener('click', refreshDeveloperLog);
$('#copyDeveloperDiagnostics').addEventListener('click', async () => {
  const diagnostics = {
    appVersion: '0.1.0',
    userAgent: navigator.userAgent,
    theme: root.dataset.theme,
    developerMode,
    buddyMode,
    sensors: currentBuddySensors,
    modules: registry.list().map(({ id, enabled }) => ({ id, enabled })),
    recentEvents: developerEvents.slice(-50),
    ruleTraces: developerRuleTraces.slice(-50),
  };
  try {
    await writeText(JSON.stringify(diagnostics, null, 2));
    toast('Diagnostics copied. Nothing was sent.');
  } catch (error) {
    toast(`Could not copy diagnostics: ${error}`);
  }
});
$('#openDeveloperData').addEventListener('click', async () => {
  try {
    await invoke('open_data_directory');
  } catch (error) {
    toast(`Could not open the data folder: ${error}`);
  }
});

for (const module of definitions) {
  $('#resetModuleData').append(new Option(module.name, module.id));
}
$('#confirmResetModuleData').addEventListener('click', async () => {
  const id = $('#resetModuleData').value;
  const module = definitions.find((item) => item.id === id);
  if (!module) {
    toast('Choose a module before resetting its data.');
    return;
  }
  const extra = id === 'links'
    ? ' Saved scenes will keep their layouts but forget their linked items.'
    : '';
  if (!window.confirm(`Reset saved data for ${module.name}? This cannot be undone.${extra}`)) return;
  try {
    await invoke('reset_module_data', { id });
    if (registry.list().some((item) => item.id === id && item.enabled)) {
      await registry.setEnabled(id, false, moduleContext);
      await registry.setEnabled(id, true, moduleContext);
    }
    toast(`Reset ${module.name} data.`);
    if (id === 'break') {
      currentBuddyRules = structuredClone(DEFAULT_PACK.rules);
      moduleContext.buddyRules = currentBuddyRules;
      eventBus.emit('buddy.rules.changed', { rules: currentBuddyRules });
      setPackObject({ ...structuredClone(DEFAULT_PACK), rules: currentBuddyRules }, { recordUndo: false });
    }
  } catch (error) {
    toast(`Could not reset ${module.name} data: ${error}`);
  }
});

async function sampleDeveloperPerformance() {
  if (!developerMode || !$('#developerPerformanceEnabled').checked || document.hidden) return;
  try {
    const sample = await invoke('developer_performance');
    const format = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    latestDeveloperPerformance =
      `${sample.cpuPercent.toFixed(2)}% process CPU · ${format(sample.privateBytes)} private · ${format(sample.workingSetBytes)} working set (WebView2 children excluded)`;
    $('#developerPerformance').textContent = `Desk Drawer process: ${latestDeveloperPerformance}.`;
    renderMotionDiagnostics();
  } catch (error) {
    $('#developerPerformance').textContent = `Performance sample failed: ${error}`;
  }
  developerPerformanceTimer = setTimeout(sampleDeveloperPerformance, 1500);
}

function renderMotionDiagnostics() {
  if (!developerMode || document.hidden) return;
  const diagnostics = motionEngine.getDiagnostics();
  const active = diagnostics.active;
  const fps = diagnostics.averageFrameIntervalMs > 0
    ? (1000 / diagnostics.averageFrameIntervalMs).toFixed(1)
    : '—';
  const frameShare = diagnostics.frameIntervalMs > 0
    ? `${(diagnostics.frameWorkMs / diagnostics.frameIntervalMs * 100).toFixed(2)}%`
    : '—';
  $('#developerMotionDiagnostics').textContent =
    `Active: ${active.length} · frame interval: ${fps} fps · JS frame work: ${diagnostics.frameWorkMs.toFixed(2)} ms (${frameShare} of interval) · dropped frames: ${diagnostics.droppedFrames}`;
  const overlay = $('#motionDebugOverlay');
  overlay.hidden = !developerMode || !$('#developerMotionOverlayToggle').checked;
  if (!overlay.hidden) {
    overlay.textContent =
      `${fps} fps · frame work ${diagnostics.frameWorkMs.toFixed(2)} ms · ${frameShare} JS frame budget · dropped ${diagnostics.droppedFrames} · ${latestDeveloperPerformance}`;
  }
  const list = $('#developerActiveAnimations');
  const current = active.map((animation) => `${animation.id} · ${animation.kind} · ${animation.effectiveFps} fps`);
  const shown = [...list.children].map((item) => item.textContent);
  if (JSON.stringify(current) !== JSON.stringify(shown)) {
    list.replaceChildren(...current.map((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));
  }
}

$('#developerMotionOverlayToggle').addEventListener('change', (event) => {
  const enabled = event.currentTarget.checked && developerMode;
  $('#motionDebugOverlay').hidden = !enabled;
  if (enabled && !$('#developerPerformanceEnabled').checked) {
    overlayStartedPerformance = true;
    $('#developerPerformanceEnabled').checked = true;
    void sampleDeveloperPerformance();
  } else if (!enabled && overlayStartedPerformance) {
    overlayStartedPerformance = false;
    $('#developerPerformanceEnabled').checked = false;
    clearTimeout(developerPerformanceTimer);
    developerPerformanceTimer = null;
    $('#developerPerformance').textContent = 'Performance sampling is off.';
  }
  renderMotionDiagnostics();
});

$('#developerPerformanceEnabled').addEventListener('change', () => {
  clearTimeout(developerPerformanceTimer);
  developerPerformanceTimer = null;
  if ($('#developerPerformanceEnabled').checked) void sampleDeveloperPerformance();
  else $('#developerPerformance').textContent = 'Performance sampling is off.';
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearTimeout(developerPerformanceTimer);
    developerPerformanceTimer = null;
  } else if ($('#developerPerformanceEnabled').checked) {
    void sampleDeveloperPerformance();
  }
});

const DEFAULT_PACK = createDefaultDeskPack(sleepyCatPack);
let pendingPack = null;
let undoStack = [];
let undoTimer;
let lastEditorSnapshot = '';
let pendingUndoBase = null;
let currentBuddySensors = Object.fromEntries(SENSOR_OPTIONS.map(([id]) => [id, false]));
let currentBuddyRules = DEFAULT_PACK.rules;

function showPackResult(message, valid = false) {
  packStatus.textContent = message;
  packStatus.dataset.valid = String(valid);
}

function pushUndo(value) {
  if (undoStack.at(-1) !== value) undoStack.push(value);
  if (undoStack.length > 20) undoStack.shift();
  $('#undoPackEdit').disabled = undoStack.length === 0;
  $('#undoPackEditJson').disabled = undoStack.length === 0;
}

function setPackText(value, { recordUndo = true } = {}) {
  clearTimeout(undoTimer);
  if (recordUndo) pushUndo(packEditor.value);
  packEditor.value = value;
  lastEditorSnapshot = value;
  pendingUndoBase = null;
  validatePackEditor();
}

function setPackObject(pack, options) {
  setPackText(JSON.stringify(pack, null, 2), options);
}

function undoPackEdit() {
  clearTimeout(undoTimer);
  if (pendingUndoBase !== null) {
    pushUndo(pendingUndoBase);
    lastEditorSnapshot = packEditor.value;
    pendingUndoBase = null;
  }
  const previous = undoStack.pop();
  if (previous === undefined) return;
  packEditor.value = previous;
  lastEditorSnapshot = previous;
  pendingUndoBase = null;
  validatePackEditor();
  $('#undoPackEdit').disabled = undoStack.length === 0;
  $('#undoPackEditJson').disabled = undoStack.length === 0;
}

function validatePackEditor() {
  try {
    const pack = validateDeskPack(packEditor.value);
    showPackResult(
      `Valid: ${pack.name} · ${pack.rules.length} rules · ${Object.keys(pack.buddy.animations).length} animations.`,
      true,
    );
    renderBehaviorRules(pack.rules, pack.lines);
    return pack;
  } catch (error) {
    showPackResult(`Invalid pack: ${error.message}`);
    behaviorRules.replaceChildren();
    $('#ruleTestTarget').replaceChildren();
    return null;
  }
}

function conditionSummary(condition) {
  const labels = {
    'event.kind': 'the copied item is',
    'event.count': 'the file count is',
    'mood.energy': 'energy is',
    'mood.mood': 'mood is',
    'mood.curiosity': 'curiosity is',
    'personality.curiosity': 'curiosity setting is',
  };
  const operators = { '==': 'equal to', '!=': 'not equal to', '>': 'above', '<': 'below', '>=': 'at least', '<=': 'at most', between: 'between' };
  return `${labels[condition.var] ?? condition.var} ${operators[condition.op] ?? condition.op} ${JSON.stringify(condition.value)}`;
}

function actionSummary(action, lines = {}) {
  if (Object.hasOwn(action, 'play')) return `play ${action.play}`;
  if (Object.hasOwn(action, 'say')) {
    const line = lines[action.say]?.[0] ?? action.say;
    return `say “${line}”`;
  }
  if (Object.hasOwn(action, 'toast')) return `show “${action.toast}”`;
  if (Object.hasOwn(action, 'adjust')) return `adjust ${Object.entries(action.adjust).map(([key, value]) => `${key} by ${value}`).join(', ')}`;
  return 'perform a safe action';
}

function renderBehaviorRules(rules, lines = {}) {
  behaviorRules.replaceChildren();
  $('#ruleTestTarget').replaceChildren();
  for (const [index, rule] of rules.entries()) {
    const item = document.createElement('article');
    item.className = 'behavior-rule';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = rule.enabled;
    toggle.dataset.ruleEnabled = String(index);
    toggle.setAttribute('aria-label', `Enable rule ${rule.name}`);
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = rule.name;
    const summary = document.createElement('p');
    const eventLabels = {
      'clipboard.copied': 'I copy something',
      'file.renamed': 'I rename files',
      'break.taken': 'I take a break',
    };
    const when = eventLabels[rule.when] ?? rule.when.replaceAll('.', ' ');
    const conditions = rule.if.length ? ` when ${rule.if.map(conditionSummary).join(' and ')}` : '';
    summary.textContent = `When ${when}${conditions}, ${rule.then.map((action) => actionSummary(action, lines)).join(' then ')}.`;
    copy.append(title, summary);
    const test = document.createElement('button');
    test.className = 'btn alt';
    test.type = 'button';
    test.dataset.testRule = String(index);
    test.textContent = 'Test';
    item.append(toggle, copy, test);
    behaviorRules.append(item);

    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = rule.name;
    $('#ruleTestTarget').append(option);
  }
}

function updatePackRule(index, update) {
  const pack = validatePackEditor();
  if (!pack || !pack.rules[index]) return;
  update(pack.rules[index]);
  setPackObject(pack);
}

function conditionTestValue(condition) {
  const value = condition.value;
  if (condition.op === 'between') return (value[0] + value[1]) / 2;
  if (condition.op === '==') return value;
  if (condition.op === '!=') return typeof value === 'number' ? value + 1 : `${value}-other`;
  if (condition.op === '>' || condition.op === '>=') return Number(value) + 1;
  if (condition.op === '<' || condition.op === '<=') return Number(value) - 1;
  return value;
}

function testRule(rule, lines = {}) {
  try {
    const environment = {
      event: { kind: 'link', count: 1 },
      mood: { energy: 60, mood: 60, curiosity: 60 },
      personality: { curiosity: 60 },
      state: 'idle',
      time: { hour: 12, weekday: 1 },
    };
    let randomValue = 0.5;
    for (const condition of rule.if) {
      if (condition.var === 'random') {
        const expected = condition.value;
        randomValue = condition.op === 'between'
          ? (expected[0] + expected[1]) / 2
          : condition.op === '=='
            ? expected
            : condition.op === '!='
              ? (expected < 0.5 ? 0.75 : 0.25)
              : condition.op === '>'
                ? Math.min(1, expected + 0.01)
                : condition.op === '>='
                  ? Math.max(0, expected)
                  : condition.op === '<'
                    ? Math.max(0, expected - 0.01)
                    : Math.min(1, expected);
        continue;
      }
      const value = conditionTestValue(condition);
      const segments = condition.var.split('.');
      const key = segments.pop();
      const target = segments.reduce((object, segment) => object[segment] ??= {}, environment);
      target[key] = value;
    }
    const engine = createBehaviorEngine([{ ...rule, enabled: true, cooldownSec: 0 }], {
      now: () => 1_000,
      random: () => randomValue,
      chatLimitMs: 0,
    });
    const result = engine.evaluate(rule.when, environment);
    $('#ruleTestResult').textContent = result
      ? `Matched “${rule.name}”. Preview only: ${result.actions.map((action) => actionSummary(action, lines)).join('; ') || 'no actions (speech limit).'}`
      : `“${rule.name}” did not match the sample event and conditions.`;
  } catch (error) {
    $('#ruleTestResult').textContent = `Could not test rule: ${error.message}`;
  }
}

function renderSensors(sensors) {
  const list = $('#sensorList');
  list.replaceChildren();
  for (const [id, title, description] of SENSOR_OPTIONS) {
    const label = document.createElement('label');
    label.className = 'setting';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = sensors[id] === true;
    toggle.dataset.sensor = id;
    const text = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = title;
    const detail = document.createElement('small');
    detail.textContent = description;
    text.append(name, detail);
    label.append(toggle, text);
    list.append(label);
  }
}

async function initializeBehaviorLab(preferences) {
  currentBuddySensors = Object.fromEntries(
    SENSOR_OPTIONS.map(([id]) => [id, preferences.buddy_sensors?.[id] === true]),
  );
  const initialPack = structuredClone(DEFAULT_PACK);
  initialPack.rules = structuredClone(preferences.buddy_rules ?? DEFAULT_PACK.rules);
  try {
    validateDeskPack(initialPack);
    currentBuddyRules = initialPack.rules;
  } catch (error) {
    currentBuddyRules = DEFAULT_PACK.rules;
    $('#rulesStatus').textContent = `Saved rules were invalid and were not loaded: ${error.message}. Reset to defaults and save to replace them.`;
    initialPack.rules = structuredClone(DEFAULT_PACK.rules);
  }
  setPackObject(initialPack, { recordUndo: false });
  undoStack = [];
  $('#undoPackEdit').disabled = true;
  $('#undoPackEditJson').disabled = true;
  renderSensors(currentBuddySensors);
}

function resetPackToDefaults() {
  setPackObject(structuredClone(DEFAULT_PACK));
  $('#rulesStatus').textContent = 'Preview restored to the built-in buddy rules. Save to apply them.';
}

function addRuleFromBuilder() {
  const pack = validatePackEditor();
  if (!pack) return;
  const name = $('#ruleName').value.trim();
  const idBase = `rule-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'new'}`;
  let id = idBase;
  let suffix = 2;
  while (pack.rules.some((rule) => rule.id === id)) id = `${idBase}-${suffix++}`;
  const condition = $('#ruleCondition').value;
  const rule = {
    id,
    name: name || 'New buddy rule',
    enabled: true,
    when: $('#ruleEvent').value,
    if: condition
      ? [{
        var: condition,
        op: condition === 'event.count' ? '>=' : '>',
        value: Number($('#ruleThreshold').value),
      }]
      : [],
    then: [],
    cooldownSec: 10,
    priority: 1,
    weight: 1,
  };
  const actionType = $('#ruleAction').value;
  const actionValue = $('#ruleActionValue').value.trim();
  if (actionType === 'play') rule.then.push({ play: actionValue });
  else if (actionType === 'toast') rule.then.push({ toast: actionValue });
  else {
    const match = /^(energy|mood|curiosity):(-?\d+(?:\.\d+)?)$/.exec(actionValue);
    if (!match) {
      $('#ruleTestResult').textContent = 'For mood changes, enter a variable and amount such as mood:5.';
      return;
    }
    rule.then.push({ adjust: { [match[1]]: Number(match[2]) } });
  }
  pack.rules.push(rule);
  try {
    validateDeskPack(pack);
    setPackObject(pack);
    $('#rulesStatus').textContent = `Added “${rule.name}” to the preview. Save rules to apply it.`;
  } catch (error) {
    $('#ruleTestResult').textContent = `Could not add rule: ${error.message}`;
  }
}

$('#ruleAction').addEventListener('change', (event) => {
  const value = $('#ruleActionValue');
  value.value = event.currentTarget.value === 'play'
    ? 'happy'
    : event.currentTarget.value === 'adjust'
      ? 'mood:5'
      : 'Nice work!';
  value.setAttribute('aria-label', event.currentTarget.value === 'play'
    ? 'Animation name'
    : event.currentTarget.value === 'adjust'
      ? 'Mood variable and amount'
      : 'Toast message');
});
$('#ruleCondition').addEventListener('change', (event) => {
  $('#ruleThreshold').disabled = !event.currentTarget.value;
});
$('#addRule').addEventListener('click', addRuleFromBuilder);
$('#testRuleNow').addEventListener('click', () => {
  const pack = validatePackEditor();
  const rule = pack?.rules[Number($('#ruleTestTarget').value)];
  if (rule) testRule(rule, pack.lines);
  else $('#ruleTestResult').textContent = 'Add or load a valid rule before testing it.';
});

async function saveRulesToBuddy() {
  const pack = validatePackEditor();
  if (!pack) {
    $('#rulesStatus').textContent = 'Fix the manifest validation errors before saving rules.';
    return;
  }
  const rules = pack.rules.map((rule) => ({
    ...rule,
    then: rule.then.map((action) => {
      if (!Object.hasOwn(action, 'say') || !Object.hasOwn(pack.lines, action.say)) return action;
      return { say: pack.lines[action.say][0] };
    }),
  }));
  try {
    await invoke('save_buddy_rules', { rules });
    currentBuddyRules = structuredClone(rules);
    if (moduleContext) moduleContext.buddyRules = currentBuddyRules;
    eventBus.emit('buddy.rules.changed', { rules: currentBuddyRules });
    $('#rulesStatus').textContent = 'Rules saved and applied to the buddy.';
  } catch (error) {
    $('#rulesStatus').textContent = `Could not save buddy rules: ${error}`;
  }
}

$('#saveBuddyRules').addEventListener('click', saveRulesToBuddy);
$('#undoPackEdit').addEventListener('click', undoPackEdit);
$('#undoPackEditJson').addEventListener('click', undoPackEdit);
$('#resetPackEdit').addEventListener('click', resetPackToDefaults);
$('#resetPackEditJson').addEventListener('click', resetPackToDefaults);
$('#validatePack').addEventListener('click', validatePackEditor);

packEditor.addEventListener('input', () => {
  if (pendingUndoBase === null) pendingUndoBase = lastEditorSnapshot;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    pushUndo(pendingUndoBase);
    lastEditorSnapshot = packEditor.value;
    pendingUndoBase = null;
  }, 500);
  validatePackEditor();
});

$('#sensorList').addEventListener('change', async (event) => {
  const toggle = event.target.closest('input[data-sensor]');
  if (!toggle) return;
  const { sensor: id } = toggle.dataset;
  const previous = currentBuddySensors[id] === true;
  toggle.disabled = true;
  try {
    if (toggle.checked) {
      const option = SENSOR_OPTIONS.find(([sensorId]) => sensorId === id);
      const approved = await requestPermission(
        `Allow ${option[1].toLowerCase()} sensing?`,
        `${option[2]} This sensor stays off unless you choose Enable. You can turn it off here at any time.`,
      );
      if (!approved) {
        toggle.checked = false;
        return;
      }
    }
    await invoke('set_buddy_sensor_enabled', { id, enabled: toggle.checked });
    currentBuddySensors[id] = toggle.checked;
    if (moduleContext) moduleContext.buddySensors = { ...currentBuddySensors };
    eventBus.emit('buddy.sensor.changed', { id, enabled: toggle.checked });
    $('#sensorStatus').textContent = `${toggle.checked ? 'Enabled' : 'Disabled'}: ${toggle.parentElement.querySelector('strong').textContent}.`;
  } catch (error) {
    toggle.checked = previous;
    $('#sensorStatus').textContent = `Could not save sensor setting: ${error}`;
  } finally {
    toggle.disabled = false;
  }
});

$('#behaviorRules').addEventListener('change', (event) => {
  const toggle = event.target.closest('input[data-rule-enabled]');
  if (toggle) updatePackRule(Number(toggle.dataset.ruleEnabled), (rule) => { rule.enabled = toggle.checked; });
});

$('#behaviorRules').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-test-rule]');
  if (!button) return;
  const pack = validatePackEditor();
  if (pack?.rules[Number(button.dataset.testRule)]) {
    testRule(pack.rules[Number(button.dataset.testRule)], pack.lines);
  }
});

document.querySelectorAll('[data-behavior-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    for (const tab of document.querySelectorAll('[data-behavior-tab]')) {
      const selected = tab === button;
      tab.setAttribute('aria-selected', String(selected));
    }
    for (const section of document.querySelectorAll('[data-behavior-section]')) {
      section.hidden = section.dataset.behaviorSection !== button.dataset.behaviorTab;
    }
  });
});

for (const [key, id] of Object.entries({
  energy: 'labEnergy',
  curiosity: 'labCuriosity',
  chattiness: 'labChattiness',
  clinginess: 'labClinginess',
  sleepiness: 'labSleepiness',
})) {
  $(`#${id}`).addEventListener('input', (event) => {
    eventBus.emit('buddy.personality.changed', { key, value: Number(event.currentTarget.value) });
  });
}

async function refreshInstalledPacks() {
  installedPacksStatus.textContent = 'Loading installed packs…';
  installedPacks.replaceChildren();
  try {
    const manifests = await invoke('list_installed_desk_packs');
    const preferences = await loadSettings();
    const enabledPackId = preferences.enabled_pack;
    const packs = manifests.map((manifest) => validateDeskPack(manifest));
    renderBuddyPackPicker(packs, enabledPackId);
    $('#buddyPackStatus').textContent = enabledPackId
      ? 'Choose a buddy to switch its sprite and behavior immediately.'
      : 'Choose a buddy to activate it.';
    if (packs.length === 0) {
      installedPacksStatus.textContent = 'No installed packs.';
      return;
    }
    const hasEnabled = packs.some(p => p.id === enabledPackId);
    installedPacksStatus.textContent = `${packs.length} installed pack${packs.length === 1 ? '' : 's'}${hasEnabled ? '' : ' (all disabled)'}.`;
    for (const pack of packs) {
      const card = document.createElement('article');
      card.className = 'installed-pack';
      const details = document.createElement('div');
      const title = document.createElement('h4');
      title.textContent = pack.name;
      const metadata = document.createElement('p');
      const isEnabled = enabledPackId === pack.id;
      metadata.textContent = `${pack.author} · v${pack.version} · ${pack.license} · ${isEnabled ? 'Enabled' : 'Disabled'}`;
      details.append(title, metadata);

      const enableToggle = document.createElement('button');
      enableToggle.className = 'btn';
      enableToggle.type = 'button';
      enableToggle.dataset.enablePack = pack.id;
      enableToggle.dataset.enableState = isEnabled ? 'true' : 'false';
      enableToggle.textContent = isEnabled ? 'Disable' : 'Enable';
      enableToggle.setAttribute('aria-label', `${isEnabled ? 'Disable' : 'Enable'} ${pack.name}`);

      const remove = document.createElement('button');
      remove.className = 'btn alt';
      remove.type = 'button';
      remove.dataset.deletePack = pack.id;
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', `Delete ${pack.name}`);
      card.append(details, enableToggle, remove);
      installedPacks.append(card);
    }
    if (developerMode) await refreshDeveloperSpritePacks(packs);
  } catch (error) {
    installedPacksStatus.textContent = `Could not load installed packs: ${error}`;
    $('#buddyPackStatus').textContent = `Could not load buddy choices: ${error}`;
  }
}

function drawDeveloperSpriteFrame(frameIndex, animationSequenceIndex = null) {
  if (!developerSpritePack || !developerSpriteImage) return;
  const canvas = $('#developerSpriteCanvas');
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.save();
  if ($('#developerSpriteFlip').checked) {
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
  }
  if (animationSequenceIndex !== null && developerSpriteAnimation) {
    drawSpriteFrame(
      context,
      developerSpriteImage,
      developerSpriteAnimation,
      animationSequenceIndex,
      0,
      0,
      canvas.width,
      canvas.height,
      developerSpritePack,
    );
  } else {
    const rect = spriteFrameRectangle(developerSpriteImage.width, frameIndex);
    context.drawImage(
      developerSpriteImage,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  }
  context.restore();
  if ($('#developerSpriteOverlay').checked) {
    context.save();
    context.strokeStyle = '#ff3355';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, (developerSpritePack.buddy.anchor.y / 32) * canvas.height);
    context.lineTo(canvas.width, (developerSpritePack.buddy.anchor.y / 32) * canvas.height);
    context.moveTo((developerSpritePack.buddy.anchor.x / 32) * canvas.width, 0);
    context.lineTo((developerSpritePack.buddy.anchor.x / 32) * canvas.width, canvas.height);
    context.stroke();
    context.restore();
  }
}

function playDeveloperSpriteAnimation(name) {
  cancelDeveloperSpritePreview?.();
  cancelDeveloperSpritePreview = null;
  const animation = developerSpritePack?.buddy.animations[name];
  if (!animation) return;
  developerSpriteAnimation = name;
  developerSpriteAnimationStartedAt = performance.now();
  const fps = animation.fps * Number($('#developerSpriteSpeed').value);
  if (!motionEngine.canAnimate('ui')) {
    $('#developerSpriteStatus').textContent = 'Animation preview is paused by the current motion policy.';
    drawDeveloperSpriteFrame(animation.frames[0], 0);
    return;
  }
  cancelDeveloperSpritePreview = motionEngine.register({
    id: 'developer-sprite-preview',
    kind: 'ui',
    fps,
    element: $('#developerSpriteCanvas'),
    update({ frameTime }) {
      const elapsed = Math.max(0, frameTime - developerSpriteAnimationStartedAt)
        * Number($('#developerSpriteSpeed').value);
      const playback = resolvePackAnimationFrame(animation, elapsed);
      drawDeveloperSpriteFrame(animation.frames[playback.sequenceIndex], playback.sequenceIndex);
      return !playback.complete;
    },
    onStop() {
      cancelDeveloperSpritePreview = null;
    },
  });
  $('#developerSpriteStatus').textContent =
    `${developerSpritePack.name} · ${name} · ${animation.fps} fps${animation.loop ? ' looping' : ' once'}.`;
}

function inspectDeveloperSpriteSheet(pack, image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const frames = new Set(Object.values(pack.buddy.animations).flatMap(({ frames: indexes }) => indexes));
  const empty = [];
  const missing = [];
  const feetMismatch = [];
  const columns = image.width / 32;
  for (const index of frames) {
    if (index >= columns * (image.height / 32)) {
      missing.push(index);
      continue;
    }
    const left = (index % columns) * 32;
    const top = Math.floor(index / columns) * 32;
    let hasPixels = false;
    let touchesFeetLine = false;
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        const alpha = pixels.data[((top + y) * canvas.width + left + x) * 4 + 3];
        if (alpha > 0) {
          hasPixels = true;
          if (y === 28) touchesFeetLine = true;
        }
      }
    }
    if (!hasPixels) empty.push(index);
    else if (!touchesFeetLine) feetMismatch.push(index);
  }
  return { frames, empty, missing, feetMismatch };
}

async function selectDeveloperSpritePack(id) {
  cancelDeveloperSpritePreview?.();
  cancelDeveloperSpritePreview = null;
  const [pack, bytes] = validateInstalledDeskPackAssets(
    await invoke('get_installed_desk_pack_assets', { id }),
  );
  const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
  const image = await createImageBitmap(blob);
  developerSpritePack = pack;
  developerSpriteImage = image;
  const frameIndexes = new Set(Object.values(pack.buddy.animations).flatMap(({ frames }) => frames));
  const animations = $('#developerSpriteAnimations');
  animations.replaceChildren();
  for (const name of Object.keys(pack.buddy.animations)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn alt';
    button.textContent = name;
    button.addEventListener('click', () => playDeveloperSpriteAnimation(name));
    animations.append(button);
  }
  const grid = $('#developerSpriteFrames');
  grid.replaceChildren();
  for (const index of [...frameIndexes].sort((a, b) => a - b)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sprite-viewer-frame';
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = 32;
    frameCanvas.height = 32;
    frameCanvas.getContext('2d').drawImage(
      image,
      ...Object.values(spriteFrameRectangle(image.width, index)),
      0,
      0,
      32,
      32,
    );
    const label = document.createElement('span');
    label.textContent = `${index}: ${SPRITE_FRAME_NAMES[index] ?? 'unnamed'}`;
    button.append(frameCanvas, label);
    button.addEventListener('click', () => {
      cancelDeveloperSpritePreview?.();
      cancelDeveloperSpritePreview = null;
      developerSpriteAnimation = null;
      drawDeveloperSpriteFrame(index);
    });
    grid.append(button);
  }
  drawDeveloperSpriteFrame(0);
  const { empty, missing, feetMismatch } = inspectDeveloperSpriteSheet(pack, image);
  const warnings = [
    empty.length ? `empty frames: ${empty.join(', ')}` : '',
    missing.length ? `missing frames: ${missing.join(', ')}` : '',
    feetMismatch.length ? `frames not touching row 28: ${feetMismatch.join(', ')}` : '',
  ].filter(Boolean);
  $('#developerSpriteStatus').textContent =
    `${pack.name}: ${frameIndexes.size} referenced frames, ${Object.keys(pack.buddy.animations).length} animations. ${warnings.length ? warnings.join('; ') : 'Frame bounds, pixels, and feet-line checks passed.'}`;
}

async function refreshDeveloperSpritePacks(packs) {
  const select = $('#developerSpritePack');
  const manifests = packs ?? (await invoke('list_installed_desk_packs')).map(validateDeskPack);
  const current = select.value;
  select.replaceChildren();
  for (const pack of manifests) select.add(new Option(pack.name, pack.id));
  if (!manifests.length) {
    $('#developerSpriteStatus').textContent = 'Install a buddy pack to use the sprite viewer.';
    return;
  }
  select.value = manifests.some((pack) => pack.id === current) ? current : manifests[0].id;
  await selectDeveloperSpritePack(select.value);
}

$('#developerSpritePack').addEventListener('change', (event) => {
  selectDeveloperSpritePack(event.currentTarget.value).catch((error) => {
    $('#developerSpriteStatus').textContent = `Could not load sprite preview: ${error}`;
  });
});
$('#developerSpriteFlip').addEventListener('change', () => {
  drawDeveloperSpriteFrame(0, developerSpriteAnimation ? 0 : null);
});
$('#developerSpriteOverlay').addEventListener('change', () => {
  drawDeveloperSpriteFrame(0, developerSpriteAnimation ? 0 : null);
});
$('#developerSpriteSpeed').addEventListener('input', (event) => {
  if (cancelDeveloperSpritePreview && developerSpriteAnimation) {
    motionEngine.setFps(
      'developer-sprite-preview',
      developerSpritePack.buddy.animations[developerSpriteAnimation].fps * Number(event.currentTarget.value),
    );
  }
});

$('#refreshPacks').addEventListener('click', refreshInstalledPacks);

function renderBuddyPackPicker(packs, enabledPackId) {
  const picker = $('#buddyPackPicker');
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose an installed buddy';
  const options = [placeholder, ...packs.map((pack) => {
    const option = document.createElement('option');
    option.value = pack.id;
    option.textContent = pack.name;
    return option;
  })];
  picker.replaceChildren(...options);
  picker.value = enabledPackId && packs.some((pack) => pack.id === enabledPackId)
    ? enabledPackId
    : '';
}

async function activateBuddyPack(id) {
  const assets = validateInstalledDeskPackAssets(
    await invoke('get_installed_desk_pack_assets', { id }),
  );
  await invoke('set_enabled_desk_pack', { id });
  if (moduleContext) moduleContext.enabledPackAssets = assets;
  eventBus.emit('buddy.pack.changed', { assets });
  $('#buddyPackPicker').value = id;
}

$('#buddyPackPicker').addEventListener('change', async (event) => {
  const id = event.currentTarget.value;
  if (!id) return;
  event.currentTarget.disabled = true;
  $('#buddyPackStatus').textContent = `Switching to ${event.currentTarget.selectedOptions[0].textContent}…`;
  try {
    await activateBuddyPack(id);
    $('#buddyPackStatus').textContent = 'Buddy and its behavior rules are active.';
    await refreshInstalledPacks();
  } catch (error) {
    $('#buddyPackStatus').textContent = `Could not switch buddy: ${error}`;
  } finally {
    event.currentTarget.disabled = false;
  }
});

$('#createCustomBuddy').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const name = $('#customBuddyName').value.trim();
  if (!name) {
    $('#customBuddyStatus').textContent = 'Enter a name for the new buddy.';
    $('#customBuddyName').focus();
    return;
  }
  button.disabled = true;
  try {
    const spritePath = await open({
      multiple: false,
      filters: [{ name: '32×32 buddy sprite sheets', extensions: ['png'] }],
    });
    if (!spritePath) return;
    $('#customBuddyStatus').textContent = 'Validating sprite sheet and building its behavior pack…';
    const id = await invoke('create_custom_buddy_pack', { name, spritePath });
    await activateBuddyPack(id);
    $('#customBuddyStatus').textContent =
      `${name} is ready and active. Edit its reactions in Behavior Lab.`;
    await refreshInstalledPacks();
  } catch (error) {
    $('#customBuddyStatus').textContent = `Could not create buddy: ${error}`;
  } finally {
    button.disabled = false;
  }
});

installedPacks.addEventListener('click', async (event) => {
  const enableBtn = event.target.closest('button[data-enable-pack]');
  if (enableBtn && installedPacks.contains(enableBtn)) {
    const { enablePack: id, enableState } = enableBtn.dataset;
    const nextState = enableState !== 'true';
    enableBtn.disabled = true;
    try {
      const assets = nextState
        ? validateInstalledDeskPackAssets(await invoke('get_installed_desk_pack_assets', { id }))
        : null;
      await invoke('set_enabled_desk_pack', { id: nextState ? id : null });
      if (moduleContext) {
        moduleContext.enabledPackAssets = assets;
        eventBus.emit('buddy.pack.changed', { assets });
      }
      await refreshInstalledPacks();
      showPackResult(`${nextState ? 'Enabled' : 'Disabled'} pack ${id}.`);
    } catch (error) {
      enableBtn.disabled = false;
      await refreshInstalledPacks();
      installedPacksStatus.textContent = `Could not change pack state: ${error}`;
    }
    return;
  }
  const button = event.target.closest('button[data-delete-pack]');
  if (!button || !installedPacks.contains(button)) return;
  const { deletePack: id } = button.dataset;
  if (!window.confirm(`Delete installed pack "${id}"? This cannot be undone.`)) return;
  button.disabled = true;
  try {
    const preferences = await loadSettings();
    if (preferences.enabled_pack === id) {
      await invoke('set_enabled_desk_pack', { id: null });
      if (moduleContext) moduleContext.enabledPackAssets = null;
      eventBus.emit('buddy.pack.changed', { assets: null });
    }
    await invoke('delete_installed_desk_pack', { id });
    await refreshInstalledPacks();
    showPackResult(`Deleted installed pack ${id}.`);
  } catch (error) {
    button.disabled = false;
    installedPacksStatus.textContent = `Could not delete pack ${id}: ${error}`;
  }
});

refreshInstalledPacks();

document.querySelectorAll('[data-install-buddy-pack]').forEach((button) => {
  button.addEventListener('click', async () => {
    const { installBuddyPack: id } = button.dataset;
    button.disabled = true;
    try {
      const installed = await invoke('list_installed_desk_packs');
      const wasInstalled = installed.some((pack) => pack.id === id);
      const path = wasInstalled
        ? `existing installation of ${id}`
        : await invoke('install_builtin_desk_pack', { id });
      if (button.dataset.enableAfterInstall === 'true') await activateBuddyPack(id);
      await refreshInstalledPacks();
      showPackResult(button.dataset.enableAfterInstall === 'true'
        ? `Activated ${id} from ${path}.`
        : `${wasInstalled ? 'Found' : 'Installed'} ${id} ${wasInstalled ? 'at' : 'disabled at'} ${path}. Enable it below when ready.`);
    } catch (error) {
      showPackResult(`Could not install ${id}: ${error}`);
    } finally {
      button.disabled = false;
    }
  });
});

document.querySelectorAll('[data-pack-example]').forEach((button) => {
  button.addEventListener('click', () => {
    setPackObject(structuredClone(samplePacks[button.dataset.packExample]));
    showPackResult(`${samplePacks[button.dataset.packExample].name} loaded. Validate it to review the manifest.`);
  });
});

document.querySelectorAll('[data-pack-invalid]').forEach((button) => {
  button.addEventListener('click', () => {
    const pack = structuredClone(samplePacks['sleepy-cat']);
    if (button.dataset.packInvalid === 'unknown') {
      pack.shell = 'not allowed';
    } else if (button.dataset.packInvalid === 'traversal') {
      pack.buddy.sprite = 'sprites/../outside.png';
    } else {
      pack.rules[0].then = [{ run: 'execute arbitrary code' }];
    }
    setPackObject(pack);
  });
});

$('#importPack').addEventListener('click', async () => {
  try {
    const path = await open({
      multiple: false,
      filters: [{ name: 'Desk Drawer packs', extensions: ['deskpack'] }],
    });
    if (!path) return;
    const rawPack = await invoke('inspect_desk_pack', { path });
    const pack = validateDeskPack(rawPack);
    pendingPack = { path, pack };
    $('#packPreviewTitle').textContent = `Review ${pack.name}`;
    $('#packPreviewText').textContent =
      `Author: ${pack.author} · Version: ${pack.version} · License: ${pack.license}. This pack contains ${pack.rules.length} rules and ${Object.keys(pack.buddy.animations).length} animations. It will be installed but remain disabled.`;
    $('#packPreviewDialog').showModal();
  } catch (error) {
    showPackResult(`Could not preview pack: ${error}`);
  }
});

$('#confirmPackInstall').addEventListener('click', async () => {
  if (!pendingPack) return;
  const candidate = pendingPack;
  try {
    const installedPath = await invoke('install_desk_pack', {
      path: candidate.path,
      expectedId: candidate.pack.id,
    });
    $('#packPreviewDialog').close();
    showPackResult(`Installed ${candidate.pack.name} disabled at ${installedPath}.`);
    pendingPack = null;
    await refreshInstalledPacks();
  } catch (error) {
    showPackResult(`Could not install pack: ${error}`);
  }
});

$('#cancelPackInstall').addEventListener('click', () => {
  $('#packPreviewDialog').close();
  pendingPack = null;
});

$('#exportPack').addEventListener('click', async () => {
  try {
    const pack = validateDeskPack(packEditor.value);
    const path = await save({
      defaultPath: `${pack.id}.deskpack`,
      filters: [{ name: 'Desk Drawer pack', extensions: ['deskpack'] }],
    });
    if (!path) return;
    const spriteSheet = createPlaceholderSpriteSheet(document);
    const encoded = spriteSheet.toDataURL('image/png').split(',')[1];
    const binary = atob(encoded);
    const spritePng = Array.from(binary, (character) => character.charCodeAt(0));
    await invoke('export_desk_pack', {
      packJson: JSON.stringify(pack),
      spritePng,
      path,
    });
    showPackResult(`Exported ${pack.name} to ${path}.`, true);
  } catch (error) {
    showPackResult(`Could not export pack: ${error}`);
  }
});

listen('close-confirmation-required', () => {
  const dialog = $('#closeDialog');
  if (!dialog.open) dialog.showModal();
}).catch((error) => toast(`Could not listen for close requests: ${error}`));

async function resolveCloseRequest(keepInTray) {
  try {
    await invoke('resolve_close_request', { keepInTray });
    $('#closeDialog').close();
  } catch (error) {
    toast(`Could not save the close choice: ${error}`);
  }
}

$('#keepInTray').onclick = () => resolveCloseRequest(true);
$('#quitApp').onclick = () => resolveCloseRequest(false);

$('#closeToTray').addEventListener('change', async (event) => {
  const toggle = event.currentTarget;
  try {
    await invoke('set_close_to_tray', { closeToTray: toggle.checked });
  } catch (error) {
    toggle.checked = !toggle.checked;
    toast(`Could not save the close-to-tray setting: ${error}`);
  }
});

$('#windowStyle').addEventListener('change', async (event) => {
  const select = event.currentTarget;
  const requested = select.value;
  const previous = windowStyle;
  select.disabled = true;
  try {
    await changeWindowStyle(requested);
  } catch (error) {
    select.value = previous;
    applyWindowStyle(previous);
    toast(`Could not change window style: ${error}`);
  } finally {
    select.disabled = false;
  }
});

$('#launchAtLogin').addEventListener('change', async (event) => {
  const toggle = event.currentTarget;
  try {
    if (toggle.checked) await enable();
    else await disable();
  } catch (error) {
    toggle.checked = !toggle.checked;
    toast(`Could not update the launch-at-login setting: ${error}`);
  }
});

$('#buddyMode').addEventListener('change', async (event) => {
  const selection = event.currentTarget;
  const previous = buddyMode;
  try {
    await invoke('set_buddy_mode', { mode: selection.value });
    buddyMode = selection.value;
    renderRegistry(registry.list());
  } catch (error) {
    selection.value = previous;
    toast(`Could not change buddy mode: ${error}`);
  }
});

async function loadLaunchAtLogin() {
  const toggle = $('#launchAtLogin');
  try {
    toggle.checked = await isEnabled();
  } catch (error) {
    toggle.disabled = true;
    toast(`Could not read the launch-at-login setting: ${error}`);
  }
}

registry = new ModuleRegistry(definitions, {
  persistEnabled: setModuleEnabled,
  onChange: renderRegistry,
});
renderRegistry(registry.list());
openDrawer('modules');

async function initialize() {
  try {
    await invoke('ensure_default_buddy_pack');
    await refreshInstalledPacks();
  } catch (error) {
    toast(`Could not install the default buddy art; using the built-in fallback: ${error}`);
  }
  const preferences = await loadSettings();
  applyWindowStyle(preferences.window_style === 'soft' ? 'soft' : 'native');
  $('#windowStyle').value = windowStyle;
  buddyMode = ['desk', 'roam', 'off'].includes(preferences.buddy_mode)
    ? preferences.buddy_mode
    : 'desk';
  const storedThemeSettings = preferences.theme_preferences
    ?? preferences.themePreferences
    ?? DEFAULT_THEME_PREFERENCES;
  themePreferences = migrateThemePreferences(storedThemeSettings);
  animationSettings = normalizeAnimationSettings(
    preferences.animation_settings ?? DEFAULT_ANIMATION_SETTINGS,
  );
  savedThemePreferences = structuredClone(themePreferences);
  userThemes = [];
  for (const text of themePreferences.customThemes) {
    try {
      const customTheme = parseThemeFile(text);
      if (customTheme.meta?.id && !builtinThemeIds.has(customTheme.meta.id)
        && !userThemes.some((theme) => theme.meta.id === customTheme.meta.id)) {
        userThemes.push(customTheme);
      } else {
        toast('A saved theme was skipped because its id is missing or already in use.');
      }
    } catch (error) {
      toast(`A saved custom theme was skipped: ${error}`);
    }
  }
  renderThemePicker();
  applyMotionPreference(preferences.animations_enabled !== false);
  motionEngine.setEnvironment({ reducedMotion: reducedMotionPreference.matches });
  applyAnimationSettings(animationSettings);
  applyInterfaceMotion(preferences.interface_motion ?? DEFAULT_INTERFACE_MOTION);
  interfaceMotionReady = true;
  renderThemePreferenceControls();
  deskBackgroundId = preferences.desk_background ?? null;
  deskStickers = Array.isArray(preferences.desk_stickers) ? preferences.desk_stickers : [];
  applyTheme(preferences.theme === 'glass' ? 'frost' : preferences.theme);
  if (currentThemeObject.effects?.windowEffect
    && currentThemeObject.effects.windowEffect !== 'none') {
    try {
      const nativeEffectApplied = await invoke('set_theme', {
        theme: activeThemeId,
        effect: currentThemeObject.effects.windowEffect,
      });
      if (!nativeEffectApplied) applyTheme(activeThemeId, { forceSolid: true });
    } catch (error) {
      applyTheme(activeThemeId, { forceSolid: true });
      toast(`Could not apply the saved Windows material effect: ${error}`);
    }
  }
  renderThemeColorEditor();
  if (themePreferences.scheduleEnabled || themePreferences.followSystem) applyScheduledOrSystemTheme();
  try {
    await renderDeskCustomization();
  } catch (error) {
    $('#deskCustomizationStatus').textContent = `Could not load desk customization: ${error}`;
  }
  $('#closeToTray').checked = preferences.close_to_tray;
  $('#buddyMode').value = buddyMode;
  await initializeBehaviorLab(preferences);
  updateDeveloperVisibility(preferences.developer_mode === true);
  await loadLaunchAtLogin();

  let enabledPackAssets = null;
  if (preferences.enabled_pack) {
    try {
      enabledPackAssets = validateInstalledDeskPackAssets(
        await invoke('get_installed_desk_pack_assets', { id: preferences.enabled_pack }),
      );
    } catch (error) {
      toast(`Could not load enabled pack: ${error}`);
    }
  }
  buddyMotionMetadata = enabledPackAssets?.[0]?.buddy.motion ?? null;

  moduleContext = {
    invoke,
    enabledPackAssets,
    listen,
    loadSettings,
    webview: getCurrentWebview(),
    events: eventBus,
    buddyRules: currentBuddyRules,
    buddySensors: currentBuddySensors,
    isDeveloperMode() {
      return developerMode;
    },
    developerClockHour() {
      return developerClockHour;
    },
    animationsEnabled() {
      return animationsEnabled;
    },
    animationEffects() {
      return animationSettings.effects;
    },
    animationSettings() {
      return animationSettings;
    },
    emitParticles: emitDeskParticles,
    animateListExit: animateListExitItems,
    motion: motionEngine,
    isModuleEnabled(id) {
      return registry.list().some((module) => module.id === id && module.enabled);
    },
    toast,
    hop() {
      const buddy = $('#buddyWrap');
      buddy.classList.remove('hop');
      void buddy.offsetWidth;
      buddy.classList.add('hop');
    },
  };
  $('#bootStatus').textContent = 'Starting enabled modules…';
  await registry.initialize(preferences.enabled_modules, moduleContext);
  $('#bootStatus').textContent = '';
  $('#bootStatus').setAttribute('aria-busy', 'false');
  if (developerMode) {
    eventBus.emit('buddy.developer.mode', { enabled: true });
    eventBus.emit('buddy.developer.snapshot.request', {});
    void refreshDeveloperLog();
  }
  const firstEnabled = registry.list().find((module) => module.enabled);
  openDrawer(firstEnabled ? firstEnabled.panelId.slice(2) : 'modules');
  if (windowStyle === 'soft') {
    try {
      cleanupSoftWindowPhysics = await installSoftWindowPhysics();
    } catch (error) {
      toast(`Soft window physics could not start: ${error}`);
    }
    animateSoftWindow('show');
  }
}

applyTheme('night');
initialize().catch((error) => {
  $('#bootStatus').textContent = `Startup could not finish: ${describeStartupError(error)}. Open a module toggle to retry it.`;
  $('#bootStatus').setAttribute('aria-busy', 'false');
  renderRegistry(registry.list());
  openDrawer('modules');
  toast('Desk Drawer could not start all modules. See Modules for details.');
});

invoke('hotkey_status')
  .then((error) => {
    if (error) {
      $('#hotkeyWarning').textContent = error;
      $('#hotkeyWarning').hidden = false;
    }
  })
  .catch((error) => toast(`Could not read global shortcut status: ${error}`));

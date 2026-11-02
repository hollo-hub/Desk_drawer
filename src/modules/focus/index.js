import {
  DEFAULT_FOCUS_TIMER_SETTINGS,
  formatFocusDuration,
  isValidFocusDuration,
  MAX_FOCUS_DURATION_MINUTES,
} from '../../core/focus-timer.js';
import { parseThemeColor } from '../../core/theme.js';
import { contrastRatio, THEME_CONTRAST_BACKDROPS } from '../../core/theme-contrast.js';

let panel;
let ctx;
let cleanups = [];
let tickTimer;
let remainingSeconds = 0;
let deadline = 0;
let breakAfter = false;
let focusTimerSettings = { ...DEFAULT_FOCUS_TIMER_SETTINGS };
let settingsSaveTimer;

function resolveCssColor(value) {
  const probe = document.createElement('span');
  probe.style.color = value;
  if (!probe.style.color) return value;
  document.body.append(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved;
}

function updateSettingsStatus(message = 'Timer settings save automatically.') {
  const foreground = resolveCssColor(focusTimerSettings.textColor
    ?? getComputedStyle(document.documentElement).getPropertyValue('--ink').trim());
  const background = resolveCssColor(
    getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),
  );
  const contrast = Math.min(...THEME_CONTRAST_BACKDROPS.map((backdrop) =>
    contrastRatio(foreground, background, backdrop)));
  const warning = contrast < 4.5 ? ' This color may be difficult to read.' : '';
  panel.querySelector('#focusTimerSettingsStatus').textContent =
    `${message} Minimum contrast: ${contrast.toFixed(1)}:1.${warning}`;
}

function renderSettings() {
  const themeInk = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
  const { r, g, b } = parseThemeColor(themeInk || '#3b3350');
  const themeInkHex = `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
  panel.querySelector('#focusMinutes').value = String(focusTimerSettings.durationMinutes);
  panel.querySelector('#focusTimerTextColor').value = focusTimerSettings.textColor ?? themeInkHex;
  panel.querySelector('#focusCountdown').style.setProperty(
    '--focus-timer-color',
    focusTimerSettings.textColor ?? 'var(--ink)',
  );
  updateSettingsStatus();
}

function render() {
  panel.querySelector('#focusCountdown').textContent = remainingSeconds
    ? formatFocusDuration(remainingSeconds)
    : 'Ready when you are.';
  panel.querySelector('#startFocus').disabled = remainingSeconds > 0;
  panel.querySelector('#stopFocus').disabled = remainingSeconds === 0;
}

function finish() {
  clearInterval(tickTimer);
  tickTimer = undefined;
  remainingSeconds = 0;
  deadline = 0;
  ctx.events.emit('focus.finished', {});
  render();
  ctx.toast('Focus session complete. Nice work.');
  if (breakAfter) ctx.events.emit('break.requested', { source: 'focus-timer' });
  ctx.events.emit('tool.used', { id: 'focus', action: 'completed' });
}

function startTimer(minutes, afterBreak = false) {
  if (remainingSeconds > 0) return false;
  if (!isValidFocusDuration(minutes)) {
    ctx.toast(`Choose a focus duration from 1 to ${MAX_FOCUS_DURATION_MINUTES} minutes.`);
    return false;
  }
  breakAfter = afterBreak;
  remainingSeconds = minutes * 60;
  deadline = Date.now() + remainingSeconds * 1000;
  ctx.events.emit('focus.started', { minutes });
  ctx.events.emit('tool.used', { id: 'focus', action: 'started' });
  render();
  tickTimer = setInterval(() => {
    remainingSeconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    if (remainingSeconds <= 0) finish();
    else render();
  }, 1000);
  return true;
}

async function persistSettings() {
  try {
    await ctx.invoke('set_focus_timer_settings', { settings: focusTimerSettings });
    updateSettingsStatus('Timer settings saved.');
  } catch (error) {
    panel.querySelector('#focusTimerSettingsStatus').textContent = `Could not save timer settings: ${error}`;
  }
}

function queueSettingsSave() {
  clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(() => {
    settingsSaveTimer = undefined;
    void persistSettings();
  }, 300);
}

export function mount(element) {
  panel = element;
  panel.hidden = true;
}

export function unmount(element) {
  element.hidden = true;
}

export async function startModule(context) {
  ctx = context;
  const preferences = await ctx.loadSettings();
  const saved = preferences.focus_timer_settings;
  if (saved && saved.schemaVersion === 1
    && isValidFocusDuration(saved.durationMinutes)
    && (saved.textColor === null || /^#[\da-f]{6}$/i.test(saved.textColor))) {
    focusTimerSettings = { ...saved };
  }
  const startButton = panel.querySelector('#startFocus');
  const stopButton = panel.querySelector('#stopFocus');
  const startHandler = () => {
    const minutes = Number(panel.querySelector('#focusMinutes').value);
    if (isValidFocusDuration(minutes) && focusTimerSettings.durationMinutes !== minutes) {
      focusTimerSettings.durationMinutes = minutes;
      void persistSettings();
    }
    startTimer(minutes);
  };
  const durationHandler = () => {
    const minutes = Number(panel.querySelector('#focusMinutes').value);
    if (!isValidFocusDuration(minutes)) {
      panel.querySelector('#focusTimerSettingsStatus').textContent =
        `Enter a whole number from 1 to ${MAX_FOCUS_DURATION_MINUTES} minutes.`;
      return;
    }
    focusTimerSettings.durationMinutes = minutes;
    void persistSettings();
  };
  const colorHandler = () => {
    focusTimerSettings.textColor = panel.querySelector('#focusTimerTextColor').value;
    renderSettings();
    queueSettingsSave();
  };
  const resetColorHandler = () => {
    focusTimerSettings.textColor = null;
    renderSettings();
    void persistSettings();
  };
  const stopHandler = () => {
    clearInterval(tickTimer);
    tickTimer = undefined;
    remainingSeconds = 0;
    deadline = 0;
    ctx.events.emit('focus.finished', {});
    render();
  };
  startButton.addEventListener('click', startHandler);
  stopButton.addEventListener('click', stopHandler);
  panel.querySelector('#focusMinutes').addEventListener('change', durationHandler);
  panel.querySelector('#focusTimerTextColor').addEventListener('input', colorHandler);
  panel.querySelector('#resetFocusTimerColor').addEventListener('click', resetColorHandler);
  cleanups.push(() => startButton.removeEventListener('click', startHandler));
  cleanups.push(() => stopButton.removeEventListener('click', stopHandler));
  cleanups.push(() => panel.querySelector('#focusMinutes').removeEventListener('change', durationHandler));
  cleanups.push(() => panel.querySelector('#focusTimerTextColor').removeEventListener('input', colorHandler));
  cleanups.push(() => panel.querySelector('#resetFocusTimerColor').removeEventListener('click', resetColorHandler));
  cleanups.push(ctx.events.on('focus.start-requested', ({ minutes, breakAfter: takeBreak }) => {
    startTimer(minutes, takeBreak);
  }));
  renderSettings();
  render();
}

export { startModule as start };

export function stop() {
  if (settingsSaveTimer) {
    clearTimeout(settingsSaveTimer);
    settingsSaveTimer = undefined;
    void persistSettings();
  }
  clearInterval(tickTimer);
  tickTimer = undefined;
  remainingSeconds = 0;
  deadline = 0;
  ctx?.events.emit('focus.finished', {});
  cleanups.forEach((cleanup) => cleanup());
  cleanups = [];
  focusTimerSettings = { ...DEFAULT_FOCUS_TIMER_SETTINGS };
}

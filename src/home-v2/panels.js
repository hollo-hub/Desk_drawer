import { ORDER, THEMES } from './themes.js';
import {
  formatFocusDuration,
  isValidFocusDuration,
  MAX_FOCUS_DURATION_MINUTES,
} from '../core/focus-timer.js';
import { registerToolPanels } from './tool-panels.js';

const registry = new Map();
let current = null;

export function registerPanel(id, def) { registry.set(id, def); }
export function hasPanel(id) { return registry.has(id); }

export function openPanel(id, api) {
  closePanel();
  const def = registry.get(id);
  if (!def) return;
  const el = document.createElement('section');
  el.className = 'panel';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', def.title);
  el.innerHTML = '<header><h2></h2><button class="x" aria-label="Close panel">\u00d7</button></header><div class="body"></div>';
  el.querySelector('h2').textContent = def.title;
  el.querySelector('.x').onclick = closePanel;
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.getElementById('panels').appendChild(el);
  const cleanup = def.mount(el.querySelector('.body'), api);
  document.getElementById('v2Home')?.classList.add('panel-open');
  current = {
    el,
    def,
    cleanup: typeof cleanup === 'function' ? cleanup : null,
    previousFocus,
  };
  requestAnimationFrame(() => {
    el.classList.add('in');
    el.querySelector('.x').focus();
  });
}

export function notice(message) {
  const host = document.getElementById('panels');
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

export function closePanel() {
  if (!current) return;
  const panel = current;
  current = null;
  panel.cleanup?.();
  if (panel.def.unmount) panel.def.unmount();
  panel.el.remove();
  document.getElementById('v2Home')?.classList.remove('panel-open');
  if (panel.previousFocus?.isConnected) panel.previousFocus.focus();
}

function row(label, control) {
  const d = document.createElement('div');
  d.className = 'row';
  const l = document.createElement('label'); l.textContent = label;
  d.append(l, control);
  return d;
}

registerPanel('focus', {
  title: 'Focus',
  mount(body, api) {
    const presets = document.createElement('div');
    presets.className = 'chips focus-presets';
    const num = document.createElement('input');
    num.type = 'number';
    num.min = 1;
    num.max = MAX_FOCUS_DURATION_MINUTES;
    num.step = 1;
    num.value = api.settings.focus.minutes;
    num.setAttribute('aria-label', 'Minutes');
    const presetButtons = [];
    [15, 25, 45, 90].forEach((m) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = m + ' min';
      b.addEventListener('click', () => { num.value = m; sync(); });
      presets.appendChild(b);
      presetButtons.push(b);
    });
    const reminderLabel = document.createElement('label');
    reminderLabel.className = 'focus-reminder';
    const reminder = document.createElement('input');
    reminder.type = 'checkbox';
    reminder.checked = api.settings.focus.breakReminder;
    reminder.setAttribute('aria-label', 'Break reminder');
    const reminderText = document.createElement('span');
    reminderText.textContent = 'Break reminder';
    reminderLabel.append(reminder, reminderText);
    const start = document.createElement('button');
    start.type = 'button';
    start.className = 'primary';
    const remaining = document.createElement('p');
    remaining.className = 'focus-remaining';
    remaining.setAttribute('aria-label', 'Focus session time remaining');
    const sync = () => {
      const focus = api.focus;
      const valid = isValidFocusDuration(Number(num.value));
      start.textContent = focus.running ? 'Stop session' : 'Start focus';
      start.disabled = !focus.running && !valid;
      num.disabled = focus.running;
      presetButtons.forEach((button) => { button.disabled = focus.running; });
      reminder.disabled = focus.running;
      remaining.textContent = focus.running
        ? `Remaining: ${formatFocusDuration(focus.remainingSeconds)}`
        : focus.completed ? 'Focus session complete. Nice work.' : 'Ready when you are.';
    };
    start.addEventListener('click', async () => {
      if (api.focus.running) {
        api.stopFocus();
        sync();
        return;
      }
      const minutes = Number(num.value);
      if (!isValidFocusDuration(minutes)) {
        remaining.textContent = `Enter a whole number from 1 to ${MAX_FOCUS_DURATION_MINUTES} minutes.`;
        return;
      }
      const breakReminder = reminder.checked;
      const permission = breakReminder
        ? api.requestFocusNotifications()
        : Promise.resolve(false);
      const saved = await api.saveFocusSettings({
        ...api.settings.focus,
        minutes,
        breakReminder,
      });
      if (!saved) return;
      api.startFocus(minutes, breakReminder, permission);
      sync();
    });
    num.addEventListener('input', sync);
    reminder.addEventListener('change', sync);
    sync();
    const refreshTimer = window.setInterval(sync, 250);
    body.append(presets, row('Minutes', num), start, remaining, reminderLabel);
    return () => window.clearInterval(refreshTimer);
  },
});

registerPanel('welcome', {
  title: 'Welcome',
  mount(body, api) {
    const steps = [
      { title: 'Meet your cat', copy: 'Your desk buddy is ready to help you settle in.' },
      { title: 'Find your tools', copy: 'Click the cat to summon your tools. Press Ctrl+K for everything else.' },
      { title: 'Make it yours', copy: 'Choose a theme and up to five favorite tools for your orbit.' },
    ];
    const progress = document.createElement('p');
    progress.className = 'panel-meta';
    progress.setAttribute('aria-live', 'polite');
    const heading = document.createElement('h3');
    const copy = document.createElement('p');
    const themeGrid = document.createElement('div');
    themeGrid.className = 'welcome-themes';
    themeGrid.setAttribute('aria-label', 'Choose a theme');
    const favoriteGrid = document.createElement('div');
    favoriteGrid.className = 'welcome-favorites';
    favoriteGrid.setAttribute('aria-label', 'Choose favorite tools');
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = 'Back';
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'primary';
    let step = 0;
    let selectedTheme = document.documentElement.dataset.theme || 'night';
    let favorites = api.settings.favorites.slice(0, 5);

    for (const id of ORDER) {
      const theme = THEMES[id];
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.className = 'welcome-theme';
      choice.textContent = theme.name;
      choice.setAttribute('aria-pressed', String(id === selectedTheme));
      choice.style.setProperty('--welcome-theme-sky', theme.sky[0] || '#202030');
      choice.addEventListener('click', () => {
        selectedTheme = id;
        themeGrid.querySelectorAll('button').forEach((button) => {
          button.setAttribute('aria-pressed', String(button.dataset.theme === id));
        });
        const themeSelect = document.getElementById('settingsTheme');
        if (themeSelect instanceof HTMLSelectElement) {
          themeSelect.value = id;
          themeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      choice.dataset.theme = id;
      themeGrid.append(choice);
    }

    const tools = [
      ['scenes', 'Scenes'], ['focus', 'Focus'], ['clipboard', 'Clipboard'],
      ['links', 'Links'], ['notes', 'Notes'], ['tidy', 'Tidy downloads'],
      ['rename', 'Rename files'], ['layouts', 'Window layouts'],
      ['picker', 'Color picker'], ['awake', 'Keep awake'],
    ];
    for (const [id, label] of tools) {
      const choice = document.createElement('label');
      choice.className = 'welcome-favorite';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = id;
      checkbox.checked = favorites.includes(id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked && favorites.length >= 5) {
          checkbox.checked = false;
          return;
        }
        favorites = checkbox.checked
          ? [...favorites, id]
          : favorites.filter((favorite) => favorite !== id);
      });
      choice.append(checkbox, document.createTextNode(label));
      favoriteGrid.append(choice);
    }

    const update = () => {
      const current = steps[step];
      progress.textContent = `Step ${step + 1} of ${steps.length}`;
      heading.textContent = current.title;
      copy.textContent = current.copy;
      back.hidden = step === 0;
      next.textContent = step === steps.length - 1 ? 'Finish' : 'Next';
      themeGrid.hidden = step !== 2;
      favoriteGrid.hidden = step !== 2;
      if (step === 0) api.celebrate();
    };
    back.addEventListener('click', () => {
      step = Math.max(0, step - 1);
      update();
    });
    next.addEventListener('click', async () => {
      if (step < steps.length - 1) {
        step += 1;
        update();
        return;
      }
      const saved = await api.set({ favorites, onboarded: true });
      if (saved) closePanel();
    });
    body.append(progress, heading, copy, themeGrid, favoriteGrid, back, next);
    update();
  },
});

registerPanel('buddy', {
  title: 'Buddy',
  mount(body, api) {
    const description = document.createElement('p');
    description.textContent = 'The halo follows the active theme until you choose a color.';

    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Halo color';
    const color = document.createElement('input');
    color.type = 'color';
    color.value = api.haloColor;
    color.setAttribute('aria-label', 'Halo color');
    color.addEventListener('change', async () => {
      const saved = await api.set({ haloColor: color.value });
      if (!saved) color.value = api.haloColor;
    });
    colorLabel.append(color);

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'White';
    reset.addEventListener('click', async () => {
      const saved = await api.set({ haloColor: null });
      if (saved) color.value = api.haloColor;
    });

    body.append(description, colorLabel, reset);
  },
});

registerToolPanels(registerPanel);

import { invoke, isTauri } from '@tauri-apps/api/core';
import { isValidFocusDuration } from '../core/focus-timer.js';

export const DEFAULTS = {
  version: 2,
  theme: 'night',
  haloColor: null,
  favorites: ['scenes', 'focus', 'clipboard', 'links', 'notes'],
  enabledTools: { scenes: true, focus: true, clipboard: true, links: true, notes: true, tidy: true, rename: true, layouts: true, picker: true, awake: true },
  motion: 'full',
  customCursor: true,
  windowStyle: 'soft',
  pinned: false,
  startWithWindows: false,
  focus: { minutes: 25, breakMinutes: 5, breakReminder: true },
  clipboard: { capture: true, max: 200 },
  onboarded: false,
  sound: false,
};

const FAVORITE_IDS = new Set([
  'scenes', 'focus', 'clipboard', 'links', 'notes', 'tidy',
  'rename', 'layouts', 'picker', 'awake', 'pin', 'buddy',
]);

export function normalizeFavorites(value) {
  if (!Array.isArray(value)) return DEFAULTS.favorites.slice();
  return [...new Set(value.filter((id) => FAVORITE_IDS.has(id)))].slice(0, 6);
}

function normalizeFocusSettings(value) {
  const focus = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    ...DEFAULTS.focus,
    ...focus,
    minutes: isValidFocusDuration(focus.minutes) ? focus.minutes : DEFAULTS.focus.minutes,
    breakReminder: typeof focus.breakReminder === 'boolean'
      ? focus.breakReminder
      : DEFAULTS.focus.breakReminder,
    textColor: typeof focus.textColor === 'string' && /^#[\da-f]{6}$/i.test(focus.textColor)
      ? focus.textColor
      : null,
  };
}

export async function loadSettings() {
  if (isTauri()) {
    try {
      const saved = await invoke('app_preferences');
      const focusTimer = saved.focus_timer_settings ?? {};
      return {
        settings: {
          ...DEFAULTS,
          theme: saved.theme ?? DEFAULTS.theme,
          haloColor: saved.halo_color ?? null,
          favorites: normalizeFavorites(saved.home_favorites),
          onboarded: saved.home_onboarded === true,
          focus: normalizeFocusSettings({
            minutes: focusTimer.durationMinutes,
            breakReminder: focusTimer.breakReminder,
            textColor: focusTimer.textColor,
          }),
          motion: saved.animations_enabled === false
            ? 'reduced'
            : saved.animation_settings?.ecoMode === true ? 'eco' : 'full',
        },
        warning: null,
      };
    } catch (error) {
      console.error('app_preferences failed while loading the V2 home settings', error);
      return {
        settings: { ...DEFAULTS, favorites: DEFAULTS.favorites.slice() },
        warning: "Couldn't read your saved settings, so the V2 home is using defaults.",
      };
    }
  }

  try {
    const raw = localStorage.getItem('dd2.settings');
    const saved = raw ? JSON.parse(raw) : null;
    return {
      settings: {
        ...DEFAULTS,
        ...(saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}),
        favorites: normalizeFavorites(saved?.favorites),
        focus: normalizeFocusSettings(saved?.focus),
      },
      warning: null,
    };
  } catch (error) {
    console.error('V2 home local settings could not be read', error);
    return {
      settings: { ...DEFAULTS, favorites: DEFAULTS.favorites.slice() },
      warning: 'Your saved home settings could not be read, so defaults are in use.',
    };
  }
}

export async function saveFocusSettings(focus) {
  if (!focus || !isValidFocusDuration(focus.minutes) || typeof focus.breakReminder !== 'boolean') {
    return {
      ok: false,
      message: 'Choose a whole focus duration from 1 minute to 7 days.',
    };
  }

  const normalized = normalizeFocusSettings(focus);
  try {
    if (isTauri()) {
      await invoke('set_focus_timer_settings', {
        settings: {
          schemaVersion: 1,
          durationMinutes: normalized.minutes,
          textColor: normalized.textColor,
          breakReminder: normalized.breakReminder,
        },
      });
    } else {
      const raw = localStorage.getItem('dd2.settings');
      const parsed = raw ? JSON.parse(raw) : {};
      const saved = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      localStorage.setItem('dd2.settings', JSON.stringify({
        ...DEFAULTS,
        ...saved,
        favorites: normalizeFavorites(saved.favorites),
        focus: normalized,
      }));
    }
    return { ok: true, message: '' };
  } catch (error) {
    console.error('Focus settings could not be saved', error);
    return {
      ok: false,
      message: "Couldn't save your Focus settings. Check the app's storage and try again.",
    };
  }
}

export async function saveSettings(s) {
  try {
    if (isTauri()) {
      await invoke('set_home_settings', {
        haloColor: s.haloColor ?? null,
        favorites: normalizeFavorites(s.favorites),
        onboarded: s.onboarded === true,
      });
    } else {
      localStorage.setItem('dd2.settings', JSON.stringify({
        ...s,
        favorites: normalizeFavorites(s.favorites),
      }));
    }
    return { ok: true, message: '' };
  } catch (error) {
    console.error('V2 home settings could not be saved', error);
    return {
      ok: false,
      message: "Couldn't save your home settings. Check the app's storage and try again.",
    };
  }
}

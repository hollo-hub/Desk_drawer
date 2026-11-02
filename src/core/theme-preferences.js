export const THEME_PREFERENCES_VERSION = 2;

export const DEFAULT_THEME_PREFERENCES = Object.freeze({
  schemaVersion: THEME_PREFERENCES_VERSION,
  fontOverride: null,
  followSystem: false,
  lightTheme: 'cozy',
  darkTheme: 'night',
  scheduleEnabled: false,
  lightStart: '07:00',
  darkStart: '19:00',
  accentOverride: null,
  opacityOverrides: {},
  customThemes: [],
  buddyFollowsTheme: false,
});

function validTime(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error('Theme schedule times must use 24-hour HH:MM format.');
  }
  return value;
}

function validId(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,59}$/.test(value)) {
    throw new Error('Theme ids must use lowercase letters, numbers, and hyphens.');
  }
  return value;
}

export function migrateThemePreferences(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Theme preferences must be an object.');
  }
  const allowed = new Set(Object.keys(DEFAULT_THEME_PREFERENCES));
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Unknown theme preference field "${key}".`);
  }
  if (value.schemaVersion !== undefined && ![1, THEME_PREFERENCES_VERSION].includes(value.schemaVersion)) {
    throw new Error(`Theme preferences schemaVersion must be 1 or ${THEME_PREFERENCES_VERSION}.`);
  }
  const migrated = { ...DEFAULT_THEME_PREFERENCES, ...value };
  migrated.schemaVersion = THEME_PREFERENCES_VERSION;
  if (migrated.fontOverride !== null
    && !['pixel', 'readable', 'mono'].includes(migrated.fontOverride)) {
    throw new Error('Font override must be pixel, readable, mono, or null.');
  }
  migrated.lightTheme = validId(migrated.lightTheme);
  migrated.darkTheme = validId(migrated.darkTheme);
  if (typeof migrated.followSystem !== 'boolean'
    || typeof migrated.scheduleEnabled !== 'boolean'
    || typeof migrated.buddyFollowsTheme !== 'boolean') {
    throw new Error('Theme preference toggles must be booleans.');
  }
  migrated.lightStart = validTime(migrated.lightStart);
  migrated.darkStart = validTime(migrated.darkStart);
  if (migrated.accentOverride !== null
    && (typeof migrated.accentOverride !== 'string' || !/^#[\da-f]{6}$/i.test(migrated.accentOverride))) {
    throw new Error('Accent override must be a six-digit hex color or null.');
  }
  if (!migrated.opacityOverrides || typeof migrated.opacityOverrides !== 'object'
    || Array.isArray(migrated.opacityOverrides)) {
    throw new Error('Theme opacity overrides must be an object.');
  }
  for (const [id, opacity] of Object.entries(migrated.opacityOverrides)) {
    validId(id);
    if (!Number.isInteger(opacity) || opacity < 0 || opacity > 100) {
      throw new Error('Theme opacity overrides must be whole percentages from 0 to 100.');
    }
  }
  if (!Array.isArray(migrated.customThemes)
    || migrated.customThemes.some((theme) => typeof theme !== 'string')
    || migrated.customThemes.reduce((total, theme) => total + new TextEncoder().encode(theme).byteLength, 0) > 512 * 1024) {
    throw new Error('Saved custom themes must be JSON text totaling no more than 512 KiB.');
  }
  return migrated;
}

function timeToMinutes(value) {
  const [hours, minutes] = validTime(value).split(':').map(Number);
  return hours * 60 + minutes;
}

export function resolveScheduledTheme(preferences, date = new Date()) {
  const settings = migrateThemePreferences(preferences);
  if (!settings.scheduleEnabled) return null;
  const current = date.getHours() * 60 + date.getMinutes();
  const lightStart = timeToMinutes(settings.lightStart);
  const darkStart = timeToMinutes(settings.darkStart);
  const isLight = lightStart <= darkStart
    ? current >= lightStart && current < darkStart
    : current >= lightStart || current < darkStart;
  return isLight ? settings.lightTheme : settings.darkTheme;
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseThemeColor,
  parseThemeFile,
  serializeThemeColor,
  serializeThemeFile,
  THEME_FILE_LIMIT_BYTES,
  validateTheme,
} from '../src/core/theme.js';
import { BUILTIN_THEME_IDS, loadBuiltinThemes } from '../src/themes/index.js';
import { checkThemeContrast, contrastRatio, fixThemeContrast } from '../src/core/theme-contrast.js';
import { migrateThemePreferences, resolveScheduledTheme } from '../src/core/theme-preferences.js';
import { applyThemeTokens, resolveThemeTokens } from '../src/core/theme-tokens.js';

const validTheme = {
  schemaVersion: 1,
  bg: '#000',
  wall: '#fff',
  drawer: 'rgb(255, 255, 255)',
  edge: 'hsl(0, 0%, 0%)',
  ink: '#123456',
  accent: 'rgba(20, 40, 60, 0.5)',
  buddy: '#abcdef',
  desk: 'transparent',
  meta: { id: 'test-theme', name: 'Test theme' },
};

test('theme files parse, validate, and canonicalize colors before use', () => {
  const parsed = parseThemeFile(JSON.stringify(validTheme));
  assert.equal(parsed.bg, '#000000');
  assert.equal(parsed.wall, '#ffffff');
  assert.equal(parsed.drawer, '#ffffff');
  assert.equal(parsed.edge, '#000000');
  assert.equal(parsed.accent, 'rgba(20, 40, 60, 0.5)');
  assert.equal(parsed.desk, 'rgba(0, 0, 0, 0)');
  assert.equal(parsed.meta.name, 'Test theme');
  assert.equal(parsed.effects, undefined);

  const serialized = serializeThemeFile(parsed);
  assert.deepEqual(parseThemeFile(serialized), parsed);
});

test('all ten built-in themes load through the user theme validator', () => {
  const themes = loadBuiltinThemes();
  assert.equal(themes.length, 10);
  assert.deepEqual(BUILTIN_THEME_IDS, [
    'cozy',
    'night',
    'transparent',
    'frost',
    'paper',
    'arcade',
    'forest',
    'savanna-dusk',
    'terminal',
    'high-contrast',
  ]);
  for (const theme of themes) {
    assert.equal(validateTheme(theme).meta.id, theme.meta.id);
    assert.equal(theme.schemaVersion, 1);
  }
  const transparent = themes.find((theme) => theme.meta.id === 'transparent');
  assert.equal(transparent.wall, 'rgba(0, 0, 0, 0)');
  assert.equal(transparent.drawer, 'rgba(0, 0, 0, 0)');
  assert.equal(transparent.desk, 'rgba(0, 0, 0, 0)');
  assert.equal(transparent.effects.textOutline, true);
  const terminal = themes.find((theme) => theme.meta.id === 'terminal');
  assert.equal(terminal.font, 'mono');
  assert.equal(terminal.effects.scanlines, false);
  const highContrast = themes.find((theme) => theme.meta.id === 'high-contrast');
  assert.equal(highContrast.borderWidth, 3);
});

test('theme color parser handles supported syntaxes and rejects CSS injection', () => {
  assert.deepEqual(parseThemeColor('#0f08'), { r: 0, g: 255, b: 0, a: 136 / 255 });
  assert.deepEqual(parseThemeColor('rgb(100%, 0%, 50%)'), { r: 255, g: 0, b: 127.5, a: 1 });
  assert.deepEqual(parseThemeColor('hsl(120, 100%, 50%)'), { r: 0, g: 255, b: 0, a: 1 });
  assert.equal(serializeThemeColor('hsla(0deg, 100%, 50%, 50%)'), 'rgba(255, 0, 0, 0.5)');
  for (const hostile of [
    'url(https://example.test/image.png)',
    '#fff; color: red',
    '#fff} body { display: none',
    '/* comment */ #fff',
    'expression(alert(1))',
  ]) {
    assert.throws(() => parseThemeColor(hostile));
  }
});

test('theme schema rejects missing, unknown, and incorrectly typed fields', () => {
  const missing = { ...validTheme };
  delete missing.buddy;
  assert.throws(() => validateTheme(missing), /Missing required color "buddy"/);
  assert.throws(() => validateTheme({ ...validTheme, surprise: true }), /Unknown theme field/);
  assert.throws(() => validateTheme({ ...validTheme, ink: 12 }), /Invalid ink color/);
  assert.throws(() => validateTheme({ ...validTheme, effects: { scanlines: 'yes' } }), /scanlines must be a boolean/);
  assert.throws(() => validateTheme({ ...validTheme, effects: { lockMode: true } }), /Unknown effects field/);
  assert.throws(() => validateTheme({ ...validTheme, stickers: ['ok', '../bad'] }), /safe asset ids/);
  assert.throws(() => validateTheme({ ...validTheme, stickers: ['same', 'same'] }), /duplicate/);
  assert.doesNotThrow(() => validateTheme({ ...validTheme, background: 'desk-bg', stickers: ['petal-1'] }));
  assert.throws(() => validateTheme({ ...validTheme, schemaVersion: 2 }), /schemaVersion must be 1/);
});

test('theme names, metadata, external URLs, and oversized files are rejected', () => {
  assert.throws(
    () => validateTheme({ ...validTheme, meta: { name: 'x'.repeat(61) } }),
    /meta.name must be at most 60 characters/,
  );
  assert.throws(
    () => validateTheme({ ...validTheme, meta: { description: 'See https://example.test' } }),
    /external URL/,
  );
  assert.throws(
    () => parseThemeFile(' '.repeat(THEME_FILE_LIMIT_BYTES + 1)),
    /exceeds the 51200-byte limit/,
  );
});

test('contrast math matches WCAG reference ratios and composites alpha colors', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.ok(Math.abs(contrastRatio('#777777', '#ffffff') - 4.478) < 0.01);
  assert.equal(contrastRatio('rgba(0, 0, 0, 0)', '#ffffff', '#ffffff'), 1);
  assert.equal(contrastRatio('rgba(0, 0, 0, 0)', '#ffffff', '#000000'), 1);
});

test('all built-in palettes pass required contrast checks and fixes report each change', () => {
  const themes = loadBuiltinThemes();
  for (const theme of themes) {
    const report = checkThemeContrast(theme);
    assert.equal(report.passed, true, `${theme.meta.id}: ${report.checks.filter((check) => !check.passed).map((check) => check.id).join(', ')}`);
    assert.equal(report.checks.length, 9);
  }
  const cozy = themes.find((theme) => theme.meta.id === 'cozy');
  const failingUserTheme = { ...cozy, meta: { ...cozy.meta, id: 'user-cozy' }, accent: '#ff6f91' };
  const fixed = fixThemeContrast(failingUserTheme);
  assert.deepEqual(fixed.changes.map(({ field }) => field), ['accent']);
  assert.equal(fixed.changes[0].from, '#ff6f91');
  assert.equal(checkThemeContrast(fixed.theme).passed, true);
});

test('theme preferences migrate defaults, validate schedules, and handle overnight ranges', () => {
  const migrated = migrateThemePreferences({ lightTheme: 'paper', darkTheme: 'night' });
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.lightStart, '07:00');
  const scheduled = {
    ...migrated,
    scheduleEnabled: true,
    lightStart: '20:00',
    darkStart: '06:00',
  };
  assert.equal(resolveScheduledTheme(scheduled, new Date(2025, 0, 1, 22, 0)), 'paper');
  assert.equal(resolveScheduledTheme(scheduled, new Date(2025, 0, 1, 12, 0)), 'night');
  assert.throws(() => migrateThemePreferences({ lightStart: '24:00' }), /24-hour HH:MM/);
  assert.throws(() => migrateThemePreferences({ opacityOverrides: { cozy: 101 } }), /0 to 100/);
  assert.throws(() => migrateThemePreferences({ futureField: true }), /Unknown theme preference field/);
  assert.throws(() => migrateThemePreferences({ schemaVersion: 3 }), /schemaVersion must be 1 or 2/);
});

test('theme token mapping derives safe component tokens from validated palettes', () => {
  const cozy = loadBuiltinThemes().find((theme) => theme.meta.id === 'cozy');
  const tokens = resolveThemeTokens(cozy);
  assert.equal(tokens['--bg'], cozy.bg);
  assert.equal(tokens['--buddy'], cozy.buddy);
  assert.equal(tokens['--theme-border-width'], '3px');
  assert.equal(tokens['--theme-radius'], '0px');
  assert.equal(resolveThemeTokens(cozy, { font: 'mono' })['--font'], 'ui-monospace, Menlo, Consolas, monospace');
  assert.doesNotThrow(() => parseThemeColor(tokens['--muted']));
  assert.doesNotThrow(() => parseThemeColor(tokens['--ink-secondary']));
  const solidFallback = resolveThemeTokens(loadBuiltinThemes().find((theme) => theme.meta.id === 'frost'), { forceSolid: true });
  assert.equal(parseThemeColor(solidFallback['--wall']).a, 1);
  const applied = [];
  applyThemeTokens({ setProperty: (name, value) => applied.push([name, value]) }, cozy);
  assert.ok(applied.some(([name]) => name === '--focus-ring'));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { Cat } from '../src/home-v2/cat.js';
import { computeCatLayout } from '../src/home-v2/layout.js';
import { normalizeFavorites } from '../src/home-v2/settings.js';
import { DEFAULT_FAVORITES, Orbit } from '../src/home-v2/stage.js';
import { resolveHomeThemeId, themePaletteEntries } from '../src/home-v2/theme-adapter.js';
import { BUILTIN_THEME_IDS, loadBuiltinThemes } from '../src/themes/index.js';

test('cat layout uses the specified integer scale and stage proportions', () => {
  const layout = computeCatLayout(960, 640);

  assert.equal(layout.scale, 8);
  assert.equal(layout.catWidth, 256);
  assert.equal(layout.stageCenterY, 473.6);
  assert.equal(layout.stageWidth, 460.8);
  assert.equal(layout.catX, 352);
  assert.equal(layout.centerY, layout.catY + layout.catWidth / 2);
});

test('cat scale clamps to the supported minimum and maximum', () => {
  assert.equal(computeCatLayout(640, 480).scale, 6);
  assert.equal(computeCatLayout(1920, 1200).scale, 12);
});

test('cat layout rejects invalid canvas dimensions', () => {
  assert.throws(() => computeCatLayout(0, 640), RangeError);
  assert.throws(() => computeCatLayout(960, Number.NaN), RangeError);
});

test('cat tracks pointer direction and hops on interaction', () => {
  const cat = new Cat();
  cat.setLook(0.8, 0, true);
  cat.hop();
  cat.update(0.15, false);

  assert.equal(cat.state('cozy').eyes, 'lookRight');
  assert.ok(cat.hopOffset() < 0);

  cat.update(0.05, true);
  assert.equal(cat.hopOffset(), 0);
});

test('cat blink and tail animation advance and reduced motion freezes the tail', () => {
  const cat = new Cat();
  cat.blinkIn = 0;
  cat.update(0.01, false);
  assert.equal(cat.state('cozy').eyes, 'blink');

  cat.blinkT = -1;
  cat.update(0.25, false);
  assert.equal(cat.state('cozy').tail, 1);

  cat.update(0.25, true);
  assert.equal(cat.state('cozy').tail, 1);
});

test('orbit tiles spring out, can be hit, and tuck away instantly for reduced motion', () => {
  const orbit = new Orbit(DEFAULT_FAVORITES.slice(0, 1));
  orbit.toggle();

  for (let frame = 0; frame < 120; frame++) {
    orbit.update(1 / 60, 100, 100, 100, 100, 8, false);
  }

  assert.ok(orbit.items[0].t > 0.95);
  assert.equal(orbit.hit(orbit.items[0].x, orbit.items[0].y), 0);

  orbit.toggle();
  orbit.update(1 / 60, 100, 100, 100, 100, 8, true);
  assert.equal(orbit.items[0].t, 0);
});

test('home favorites keep supported unique tools and respect the six-tool limit', () => {
  assert.deepEqual(normalizeFavorites(undefined), ['scenes', 'focus', 'clipboard', 'links', 'notes']);
  assert.deepEqual(normalizeFavorites([]), []);
  assert.deepEqual(
    normalizeFavorites(['focus', 'unknown', 'focus', 'notes', 'links', 'scenes', 'clipboard', 'tidy']),
    ['focus', 'notes', 'links', 'scenes', 'clipboard', 'tidy'],
  );
});

test('home theme adapter maps existing ids and leaves custom themes accessory-free', () => {
  assert.equal(resolveHomeThemeId('savanna-dusk'), 'savanna');
  assert.equal(resolveHomeThemeId('high-contrast'), 'highcontrast');
  assert.equal(resolveHomeThemeId('user-theme-1'), 'user-theme-1');
  assert.equal(resolveHomeThemeId(null), 'night');
});

test('theme palette entries expose every built-in as a Theme command', () => {
  const entries = themePaletteEntries(loadBuiltinThemes());

  assert.equal(entries.length, BUILTIN_THEME_IDS.length);
  assert.deepEqual(entries.map((entry) => entry.target), BUILTIN_THEME_IDS.map((id) => `theme:${id}`));
  assert.ok(entries.some((entry) => entry.target === 'theme:savanna-dusk' && entry.name === 'Theme: Savanna dusk'));
  assert.ok(entries.some((entry) => entry.target === 'theme:high-contrast' && entry.name === 'Theme: High contrast'));
});

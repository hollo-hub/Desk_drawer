import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEventBus } from '../src/core/event-bus.js';
import { createParticlePool, PARTICLE_LIMITS } from '../src/core/particle-effects.js';
import { filterInspectorEvents, summarizeInspectorPayload } from '../src/core/developer-tools.js';
import { ModuleRegistry } from '../src/core/module-registry.js';
import {
  BUDDY_ANIMATIONS,
  createBehaviorEngine,
  driftMood,
  validateBehaviorRules,
  wanderProbability,
} from '../src/core/behavior-engine.js';
import { DEFAULT_BUDDY_RULES } from '../src/core/default-rules.js';
import { SETTINGS_CATALOG, searchSettings } from '../src/core/settings-search.js';
import {
  createMotionEngine,
  createSpring,
  normalizeMotionSettings,
} from '../src/core/motion.js';
import {
  cursorTiltFromPoint,
  DEFAULT_INTERFACE_MOTION,
  dockMagnification,
  normalizeInterfaceMotion,
  optionalMotionAllowed,
} from '../src/core/interface-motion.js';
import { applyMotionCssTokens } from '../src/core/motion-tokens.js';
import {
  DEFAULT_FOCUS_TIMER_SETTINGS,
  formatFocusDuration,
  isValidFocusDuration,
  MAX_FOCUS_DURATION_MINUTES,
} from '../src/core/focus-timer.js';
import {
  createDefaultDeskPack,
  DESK_PACK_LIMITS,
  validateDeskPack,
  validateInstalledDeskPackAssets,
  validatePackImageMetadata,
} from '../src/core/desk-pack.js';
import {
  createPlaceholderSpriteSheet,
  drawSpriteFrame,
  resolvePackAnimationFrame,
  spriteFrameRectangle,
  SPRITE_ANIMATIONS,
  SPRITE_FRAME_NAMES,
  SPRITE_FRAME_SIZE,
} from '../src/core/sprite-sheet.js';

test('event bus dispatches namespaced events and unsubscribes listeners', () => {
  const events = createEventBus();
  const received = [];
  const receivedAny = [];
  const dispose = events.on('file.renamed', (payload) => received.push(payload.count));
  const disposeAny = events.onAny((name) => receivedAny.push(name));

  events.emit('file.renamed', { count: 2 });
  dispose();
  disposeAny();
  events.emit('file.renamed', { count: 3 });

  assert.deepEqual(received, [2]);
  assert.deepEqual(receivedAny, ['file.renamed']);
  assert.throws(() => events.on('renamed', () => {}), /Invalid event name/);
});

test('focus timer supports custom durations up to seven days and formats hours', () => {
  assert.equal(DEFAULT_FOCUS_TIMER_SETTINGS.durationMinutes, 25);
  assert.equal(DEFAULT_FOCUS_TIMER_SETTINGS.breakReminder, true);
  assert.equal(isValidFocusDuration(1), true);
  assert.equal(isValidFocusDuration(MAX_FOCUS_DURATION_MINUTES), true);
  assert.equal(isValidFocusDuration(0), false);
  assert.equal(isValidFocusDuration(MAX_FOCUS_DURATION_MINUTES + 1), false);
  assert.equal(isValidFocusDuration(1.5), false);
  assert.equal(formatFocusDuration(59), '00:59');
  assert.equal(formatFocusDuration(3600), '01:00:00');
  assert.equal(formatFocusDuration(7 * 24 * 60 * 60), '168:00:00');
  assert.throws(() => formatFocusDuration(-1), /non-negative integer/);
});

test('event inspector filters by event name and coarse payload without exposing text', () => {
  const events = [
    { name: 'clipboard.copied', payload: { kind: 'link' } },
    { name: 'file.renamed', payload: { count: 3 } },
    { name: 'clipboard.copied', payload: { kind: 'text' } },
  ];

  assert.deepEqual(
    filterInspectorEvents(events, { eventName: 'clipboard.copied', query: 'LINK' }),
    [events[0]],
  );
  assert.deepEqual(
    filterInspectorEvents(events, { query: '3' }),
    [events[1]],
  );
  assert.deepEqual(summarizeInspectorPayload({
    kind: 'link',
    count: 1,
    text: 'sensitive clipboard content',
    path: 'C:\\private\\file.txt',
    nested: { value: 'hidden' },
  }), { kind: 'link', count: 1 });
});

test('settings search matches both setting names and plain-language descriptions', () => {
  assert.deepEqual(
    searchSettings(SETTINGS_CATALOG, 'GLASS OPACITY').map((entry) => entry.id),
    ['glass-opacity'],
  );
  assert.deepEqual(
    searchSettings(SETTINGS_CATALOG, 'keep clipboard history').map((entry) => entry.id),
    ['close-to-tray'],
  );
  assert.deepEqual(searchSettings(SETTINGS_CATALOG, '   '), []);
  assert.deepEqual(
    searchSettings(SETTINGS_CATALOG, 'borderless style with a transparent margin')
      .map((entry) => entry.id),
    ['window-style'],
  );
  assert.deepEqual(
    searchSettings(SETTINGS_CATALOG, 'flash the taskbar button')
      .map((entry) => entry.id),
    ['taskbar-flash'],
  );
});

test('interface motion settings validate drawer style and boolean effects', () => {
  assert.deepEqual(normalizeInterfaceMotion(), DEFAULT_INTERFACE_MOTION);
  assert.equal(normalizeInterfaceMotion({ drawer_style: 'pop' }).drawer_style, 'pop');
  assert.throws(() => normalizeInterfaceMotion({ drawer_style: 'bounce' }), /Drawer style/);
  assert.throws(() => normalizeInterfaceMotion({ cursor_tilt: 'yes' }), /cursor_tilt/);
});

test('Dock magnification has a smooth symmetric falloff with a bounded peak', () => {
  assert.equal(dockMagnification(0), 1.35);
  assert.equal(dockMagnification(84), 1);
  assert.equal(dockMagnification(-42), dockMagnification(42));
  assert.equal(dockMagnification(42), 1.175);
  assert.throws(() => dockMagnification(1, 0), /range is invalid/);
});

test('cursor tilt clamps each axis and optional effects obey reduced-motion and visibility', () => {
  const rect = { left: 10, top: 20, width: 100, height: 80 };
  assert.deepEqual(cursorTiltFromPoint(60, 60, rect), { x: 0, y: 0 });
  assert.deepEqual(cursorTiltFromPoint(110, 100, rect), { x: -3, y: 3 });
  assert.equal(optionalMotionAllowed({ enabled: true }), true);
  assert.equal(optionalMotionAllowed({ enabled: true, reducedMotion: true }), false);
  assert.equal(optionalMotionAllowed({ enabled: true, ecoMode: true }), false);
  assert.equal(optionalMotionAllowed({ enabled: true, visible: false }), false);
  assert.equal(optionalMotionAllowed({ enabled: true, glass: true }), false);
});

test('spring solver accumulates tiny deltas, clamps huge time steps, and stays bounded', () => {
  const spring = createSpring({
    position: 0,
    target: 100,
    minimum: -10,
    maximum: 10,
  });
  const tiny = spring.advance(1e-8);
  assert.equal(tiny.position, 0);

  for (let index = 0; index < 20; index += 1) {
    const value = spring.advance(1e6);
    assert.ok(Number.isFinite(value.position));
    assert.ok(Number.isFinite(value.velocity));
    assert.ok(value.position >= -10 && value.position <= 10);
  }
  assert.deepEqual(spring.snapshot(), { position: 10, velocity: 0, target: 10, settled: true });
  assert.throws(() => spring.advance(Infinity), /finite number/);
  assert.throws(() => spring.advance(-1), /must not be negative/);
});

test('all spring presets settle to their target within the 400 ms window-effect budget', () => {
  for (const preset of ['Calm', 'Default', 'Lively']) {
    const spring = createSpring({ preset, position: -40, target: 25 });
    let result = spring.snapshot();
    let frames = 0;
    for (; frames < 60 && !result.settled; frames += 1) {
      result = spring.advance(1 / 60);
    }
    assert.ok(frames <= 24, `${preset} should settle in 400 ms or less; got ${frames} frames`);
    assert.equal(result.position, 25);
    assert.equal(result.velocity, 0);
    assert.ok(result.settled);
  }
});

test('motion settings clamp to supported speed, stiffness, and bounciness ranges', () => {
  assert.deepEqual(normalizeMotionSettings({
    intensity: 'lively',
    speedMultiplier: 20,
    stiffness: 5000,
    bounciness: -1,
  }), {
    intensity: 'lively',
    speedMultiplier: 2,
    stiffness: 1000,
    bounciness: 0,
    slowMotionMultiplier: 1,
  });
  assert.throws(() => normalizeMotionSettings({ intensity: 'wild' }), /intensity/);
  assert.throws(() => normalizeMotionSettings({ speedMultiplier: NaN }), /finite number/);
});

test('motion CSS durations use shared tokens and the speed multiplier', () => {
  const properties = new Map();
  const style = { setProperty: (name, value) => properties.set(name, value) };
  applyMotionCssTokens(style, { speedMultiplier: 2 });
  assert.equal(properties.get('--motion-duration-micro'), '60ms');
  assert.equal(properties.get('--motion-duration-panel'), '120ms');
  assert.equal(properties.get('--motion-duration-window'), '180ms');
  applyMotionCssTokens(style, { enabled: false });
  assert.equal(properties.get('--motion-duration-micro'), '0ms');
  assert.equal(properties.get('--motion-duration-panel'), '0ms');
  assert.equal(properties.get('--motion-duration-window'), '0ms');
  applyMotionCssTokens(style, { speedMultiplier: 1, slowMotionMultiplier: 0.1 });
  assert.equal(properties.get('--motion-duration-micro'), '1200ms');
});

test('shared motion engine is idle without a frame loop and releases will-change on completion', () => {
  const frames = new Map();
  const timers = new Map();
  let currentTime = 0;
  let nextHandle = 0;
  const engine = createMotionEngine({
    documentRef: null,
    reducedMotionQuery: { matches: false },
    requestFrame(callback) {
      const handle = ++nextHandle;
      frames.set(handle, callback);
      return handle;
    },
    cancelFrame(handle) { frames.delete(handle); },
    setTimer(callback, delay) {
      const handle = ++nextHandle;
      timers.set(handle, { callback, dueAt: currentTime + delay });
      return handle;
    },
    clearTimer(handle) { timers.delete(handle); },
    now: () => currentTime,
  });
  assert.equal(frames.size, 0);
  assert.equal(timers.size, 0);

  const element = { style: { willChange: 'contents' } };
  let updates = 0;
  engine.register({
    id: 'one-shot-animation',
    element,
    update: () => {
      updates += 1;
      return false;
    },
  });
  assert.equal(frames.size, 1);
  const [handle, callback] = frames.entries().next().value;
  frames.delete(handle);
  callback(currentTime);
  assert.equal(updates, 1);
  assert.equal(element.style.willChange, 'contents');
  assert.equal(engine.getActive().length, 0);
  assert.equal(frames.size, 0);
  assert.equal(timers.size, 0);
  engine.dispose();
});

test('motion diagnostics report active registrations, frame work, and missed frame budgets', () => {
  const frames = new Map();
  const timers = new Map();
  let currentTime = 0;
  let nextHandle = 0;
  const engine = createMotionEngine({
    documentRef: null,
    reducedMotionQuery: { matches: false },
    requestFrame(callback) {
      const handle = ++nextHandle;
      frames.set(handle, callback);
      return handle;
    },
    cancelFrame(handle) { frames.delete(handle); },
    setTimer(callback) {
      const handle = ++nextHandle;
      timers.set(handle, callback);
      return handle;
    },
    clearTimer(handle) { timers.delete(handle); },
    now: () => currentTime,
  });
  const cancel = engine.register({ id: 'diagnostics-test', update: () => true });
  assert.equal(engine.getDiagnostics().active[0].id, 'diagnostics-test');
  const firstFrame = frames.values().next().value;
  frames.clear();
  firstFrame(0);
  const scheduledTimer = timers.values().next().value;
  timers.clear();
  currentTime = 100;
  scheduledTimer();
  const delayedFrame = frames.values().next().value;
  frames.clear();
  delayedFrame(100);
  const diagnostics = engine.getDiagnostics();
  assert.ok(diagnostics.droppedFrames >= 1);
  assert.equal(diagnostics.totalFrames, 2);
  assert.equal(diagnostics.frameIntervalMs, 100);
  cancel();
  assert.deepEqual(engine.getDiagnostics().active, []);
  engine.dispose();
});

test('reduced motion and Eco mode allow only the low-rate buddy idle sprite', () => {
  const engine = createMotionEngine({
    documentRef: null,
    reducedMotionQuery: { matches: true },
    requestFrame: () => 1,
    cancelFrame: () => {},
    setTimer: () => 1,
    clearTimer: () => {},
    now: () => 0,
  });
  assert.equal(engine.canAnimate('ui'), false);
  assert.equal(engine.canAnimate('buddy-idle'), true);
  assert.equal(engine.getPolicy().reducedMotion, true);
  const cancelIdle = engine.register({
    id: 'reduced-buddy-idle',
    kind: 'buddy-idle',
    fps: 6,
    update: () => true,
  });
  assert.equal(engine.getActive()[0].effectiveFps, 2);

  engine.setEnvironment({ ecoMode: true, reducedMotion: false });
  assert.equal(engine.canAnimate('ui'), false);
  assert.equal(engine.canAnimate('buddy-idle'), true);
  engine.setSettings({ intensity: 'off' });
  assert.equal(engine.canAnimate('buddy-idle'), false);
  assert.equal(engine.getActive().length, 0);
  cancelIdle();
  engine.dispose();
});

test('low-rate buddy animation sleeps between frames instead of polling at display rate', () => {
  const frames = new Map();
  const timers = new Map();
  let currentTime = 0;
  let nextHandle = 0;
  const engine = createMotionEngine({
    documentRef: null,
    reducedMotionQuery: { matches: true },
    requestFrame(callback) {
      const handle = ++nextHandle;
      frames.set(handle, callback);
      return handle;
    },
    cancelFrame(handle) { frames.delete(handle); },
    setTimer(callback, delay) {
      const handle = ++nextHandle;
      timers.set(handle, { callback, delay });
      return handle;
    },
    clearTimer(handle) { timers.delete(handle); },
    now: () => currentTime,
  });
  engine.register({ id: 'slow-idle', kind: 'buddy-idle', fps: 6, update: () => true });
  const [handle, callback] = frames.entries().next().value;
  frames.delete(handle);
  callback(currentTime);
  assert.equal(frames.size, 0);
  assert.equal([...timers.values()][0].delay, 500);
  currentTime += 500;
  const [timerHandle, timer] = timers.entries().next().value;
  timers.delete(timerHandle);
  timer.callback();
  assert.equal(frames.size, 1);
  engine.dispose();
});

test('shared motion engine pauses while the document is hidden and resumes without catch-up', () => {
  const listeners = new Map();
  const frames = new Map();
  let currentTime = 0;
  let nextHandle = 0;
  const documentRef = {
    visibilityState: 'hidden',
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name) { listeners.delete(name); },
  };
  const engine = createMotionEngine({
    documentRef,
    reducedMotionQuery: { matches: false },
    requestFrame(callback) {
      const handle = ++nextHandle;
      frames.set(handle, callback);
      return handle;
    },
    cancelFrame(handle) { frames.delete(handle); },
    setTimer: () => ++nextHandle,
    clearTimer() {},
    now: () => currentTime,
  });
  const deltas = [];
  const cancel = engine.register({
    id: 'visibility-test',
    element: { style: { willChange: '' } },
    update: ({ deltaSeconds }) => {
      deltas.push(deltaSeconds);
      return true;
    },
  });
  assert.equal(frames.size, 0);
  documentRef.visibilityState = 'visible';
  listeners.get('visibilitychange')();
  assert.equal(frames.size, 1);
  const [handle, callback] = frames.entries().next().value;
  frames.delete(handle);
  callback(currentTime);
  assert.deepEqual(deltas, [0]);
  documentRef.visibilityState = 'hidden';
  listeners.get('visibilitychange')();
  assert.equal(frames.size, 0);
  currentTime = 60_000;
  documentRef.visibilityState = 'visible';
  listeners.get('visibilitychange')();
  const [resumedHandle, resumedCallback] = frames.entries().next().value;
  frames.delete(resumedHandle);
  resumedCallback(currentTime);
  assert.deepEqual(deltas, [0, 0], 'resuming must not deliver a hidden-time catch-up delta');
  cancel();
  engine.dispose();
});

test('every toolbox module is opt-in by default', async () => {
  const { readFile } = await import('node:fs/promises');
  const ids = [
    'break', 'clipboard', 'color-picker', 'focus', 'keep-awake', 'layouts',
    'links', 'notes', 'pin-window', 'rename', 'scenes', 'tidy-downloads',
  ];
  for (const id of ids) {
    const source = await readFile(new URL(`../src/modules/${id}/module.json`, import.meta.url), 'utf8');
    assert.equal(JSON.parse(source).defaultEnabled, false, `${id} should be opt-in`);
  }
});

test('placeholder buddy art is packed into 32px frames for every animation', () => {
  const pixels = [];
  let fillStyle;
  const documentRef = {
    createElement: (name) => {
      assert.equal(name, 'canvas');
      return {
        getContext: () => ({
          set fillStyle(value) { fillStyle = value; },
          fillRect: (...pixel) => pixels.push({ fillStyle, pixel }),
        }),
      };
    },
  };
  const sheet = createPlaceholderSpriteSheet(documentRef);

  assert.equal(SPRITE_FRAME_SIZE, 32);
  assert.equal(sheet.width, 192);
  assert.equal(sheet.height, 96);
  assert.deepEqual(Object.keys(SPRITE_ANIMATIONS), [
    'idle', 'blink', 'walk', 'sit', 'sleep', 'yawn',
    'perk', 'happy', 'curious', 'eat', 'carried', 'fall',
  ]);
  assert.ok(pixels.length > 0);
  const signature = (frame) => pixels
    .filter(({ pixel }) => Math.floor(pixel[0] / SPRITE_FRAME_SIZE) === frame % 6)
    .map(({ fillStyle: color, pixel }) => [color, pixel[0] % SPRITE_FRAME_SIZE, pixel[1]]);
  assert.notDeepEqual(signature(0), signature(2), 'idle and blink placeholder frames should look different');
});

test('sprite sheet draws animation frames using their 32px source rectangles', () => {
  const calls = [];
  drawSpriteFrame({ drawImage: (...args) => calls.push(args) }, 'sheet', 'walk', 1, 12, 4);
  drawSpriteFrame({ drawImage: (...args) => calls.push(args) }, 'sheet', 'walk', 2, 12, 4);
  drawSpriteFrame(
    { drawImage: (...args) => calls.push(args) },
    { width: 256 },
    'blink',
    4,
    0,
    0,
    32,
    32,
    { buddy: { animations: { blink: { frames: [0, 1, 2], loop: false } } } },
  );

  assert.deepEqual(calls, [
    ['sheet', 128, 0, 32, 32, 12, 4, 32, 32],
    ['sheet', 96, 0, 32, 32, 12, 4, 32, 32],
    [{ width: 256 }, 64, 0, 32, 32, 0, 0, 32, 32],
  ]);
  assert.throws(
    () => drawSpriteFrame({ drawImage() {} }, 'sheet', 'unknown', 0),
    /Unknown buddy sprite animation/,
  );
});

test('pack sprite animations honor declared frame rates and stop non-looping sequences', () => {
  const blink = { frames: [0, 2, 0], fps: 10, loop: false };
  assert.deepEqual(resolvePackAnimationFrame(blink, 0), { sequenceIndex: 0, complete: false });
  assert.deepEqual(resolvePackAnimationFrame(blink, 100), { sequenceIndex: 1, complete: false });
  assert.deepEqual(resolvePackAnimationFrame(blink, 350), { sequenceIndex: 2, complete: true });
  assert.deepEqual(
    resolvePackAnimationFrame({ frames: [0, 1], fps: 2, loop: true }, 1500),
    { sequenceIndex: 1, complete: false },
  );
  assert.throws(() => resolvePackAnimationFrame({ frames: [], fps: 0, loop: true }, 0), /invalid/);
});

test('behavior rules evaluate conditions and enforce cooldowns', () => {
  let time = 10_000;
  const engine = createBehaviorEngine(DEFAULT_BUDDY_RULES, { now: () => time, random: () => 0 });
  const environment = {
    event: { kind: 'link' },
    mood: { curiosity: 60 },
    personality: { curiosity: 60 },
    state: 'nap',
    time: { hour: 12 },
  };

  const first = engine.evaluate('clipboard.copied', environment);
  assert.equal(first.rule.id, 'curious-link');
  assert.deepEqual(first.actions.map((action) => Object.keys(action)[0]), ['play', 'say', 'adjust']);
  assert.equal(engine.evaluate('clipboard.copied', environment), null);
  assert.equal(engine.evaluate('clipboard.copied', { ...environment, event: { kind: 'text' } }), null);
  time += 20_000;
  assert.equal(engine.evaluate('clipboard.copied', environment).rule.id, 'curious-link');
});

test('behavior rules choose the highest priority and honor global speech limits', () => {
  let time = 20_000;
  const rules = [
    { ...DEFAULT_BUDDY_RULES[0], id: 'low', priority: 1, cooldownSec: 0, then: [{ say: 'low' }] },
    { ...DEFAULT_BUDDY_RULES[0], id: 'high', priority: 3, cooldownSec: 0, then: [{ say: 'high' }] },
  ];
  const engine = createBehaviorEngine(rules, { now: () => time, random: () => 0 });
  const environment = { event: { kind: 'link' }, mood: { curiosity: 60 }, personality: { curiosity: 60 } };

  assert.equal(engine.evaluate('clipboard.copied', environment).rule.id, 'high');
  time += 1000;
  assert.deepEqual(engine.evaluate('clipboard.copied', environment).actions, []);
});

test('behavior rule tracing explains disabled, condition-failed, and selected rules', () => {
  const traces = [];
  const rules = [
    { ...DEFAULT_BUDDY_RULES[0], id: 'disabled', enabled: false },
    {
      ...DEFAULT_BUDDY_RULES[0],
      id: 'condition',
      if: [{ var: 'mood.energy', op: '>', value: 90 }],
    },
    { ...DEFAULT_BUDDY_RULES[0], id: 'selected', if: [], cooldownSec: 0 },
  ];
  const engine = createBehaviorEngine(rules, {
    now: () => 1_000,
    random: () => 0,
    onTrace: (trace) => traces.push(trace),
  });

  assert.equal(engine.evaluate('clipboard.copied', {
    event: { kind: 'link' },
    mood: { energy: 50 },
    personality: { curiosity: 50 },
  }).rule.id, 'selected');
  assert.deepEqual(
    traces[0].outcomes.map(({ id, result, reason }) => [id, result, reason]),
    [
      ['disabled', 'skipped', 'disabled'],
      ['condition', 'skipped', 'condition 1 did not match'],
      ['selected', 'matched', 'selected by priority and weight'],
    ],
  );
});

test('behavior rules reject unsafe actions and mood drift stays bounded', () => {
  assert.throws(() => validateBehaviorRules([
    { ...DEFAULT_BUDDY_RULES[0], then: [{ run: 'fetch("https://example.com")' }] },
  ]), /unsupported action/);
  assert.throws(() => validateBehaviorRules([
    { ...DEFAULT_BUDDY_RULES[0], then: [{ adjust: { energy: 1, filesystem: 1 } }] },
  ]), /mood adjustment/);
  assert.throws(() => validateBehaviorRules([
    { ...DEFAULT_BUDDY_RULES[0], then: [{ setState: 'hidden' }] },
  ]), /unknown buddy state/);
  assert.throws(() => validateBehaviorRules([
    { ...DEFAULT_BUDDY_RULES[0], if: [{ var: 'filesystem.path', op: '==', value: 'secret' }] },
  ]), /unknown condition variable/);
  assert.throws(() => validateBehaviorRules([
    { ...DEFAULT_BUDDY_RULES[0], if: [{ var: 'mood.energy', op: 'between', value: [10, 'high'] }] },
  ]), /invalid between condition/);

  assert.deepEqual(
    driftMood({ energy: 100, mood: 0, curiosity: 100 }, { minutes: 60, sleeping: true, hour: 23 }),
    { energy: 100, mood: 1.2, curiosity: 94 },
  );
  assert.ok(wanderProbability({ energy: 60, sleepiness: 70 }) > 0);
  assert.ok(wanderProbability({ energy: 60, sleepiness: 20 })
    > wanderProbability({ energy: 60, sleepiness: 90 }));
});

test('example behavior packs validate and survive an identical JSON round trip', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const name of ['sleepy-cat', 'curious-fox']) {
    const source = await readFile(new URL(`../packs/${name}/pack.json`, import.meta.url), 'utf8');
    const pack = validateDeskPack(source);
    assert.equal(JSON.stringify(validateDeskPack(JSON.stringify(pack))), JSON.stringify(pack));
  }
});

test('full Tabby and Lime Slime packs validate the 57-frame shared animation set', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const id of [
    'tabby-cat-full',
    'midnight-cat-full',
    'snow-cat-full',
    'lime-slime',
    'aqua-slime',
    'berry-slime',
  ]) {
    const source = await readFile(new URL(`../packs/${id}.json`, import.meta.url), 'utf8');
    const pack = validateDeskPack(source);
    assert.equal(pack.buddy.animations.idle.loop, true);
    assert.equal(pack.buddy.animations.walk.loop, true);
    assert.equal(pack.buddy.animations.loaf.loop, true);
    assert.deepEqual(Object.keys(pack.buddy.animations), BUDDY_ANIMATIONS);
    const frames = Object.values(pack.buddy.animations).flatMap(({ frames: indexes }) => indexes);
    assert.ok(Math.max(...frames) < 57);
    assert.equal(pack.buddy.anchor.x, 16);
    assert.equal(pack.buddy.anchor.y, 29);
  }
  assert.equal(SPRITE_FRAME_NAMES.length, 57);
  for (let index = 0; index < 64; index += 1) {
    assert.deepEqual(spriteFrameRectangle(256, index), {
      x: (index % 8) * 32,
      y: Math.floor(index / 8) * 32,
      width: 32,
      height: 32,
    });
  }
});

test('default behavior rules form a valid editable desk pack', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../packs/sleepy-cat/pack.json', import.meta.url), 'utf8');
  const pack = createDefaultDeskPack(JSON.parse(source));
  assert.equal(pack.rules.length, DEFAULT_BUDDY_RULES.length);
  assert.equal(validateDeskPack(pack).rules.length, DEFAULT_BUDDY_RULES.length);
  assert.ok(pack.rules.every((rule) => rule.then.every((action) =>
    !Object.hasOwn(action, 'say') || Object.hasOwn(pack.lines, action.say))));
});

test('installed pack assets are schema and byte validated before use', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../packs/sleepy-cat/pack.json', import.meta.url), 'utf8');
  const pack = validateDeskPack(source);
  assert.deepEqual(validateInstalledDeskPackAssets([pack, [137, 80, 78, 71]]), [pack, [137, 80, 78, 71]]);
  assert.throws(() => validateInstalledDeskPackAssets([{ ...pack, extra: true }, [137]]), /unknown field/);
  assert.throws(() => validateInstalledDeskPackAssets([pack, [256]]), /invalid shape or sprite size/);
});

test('pack validator gives clear errors for unknown fields, traversal, and unsafe actions', () => {
  const pack = {
    schemaVersion: 1,
    id: 'test-pack',
    name: 'Test Pack',
    author: 'Test',
    version: '1.0.0',
    license: 'CC0-1.0',
    buddy: {
      sprite: 'sprites/test.png',
      frame: { w: 32, h: 32 },
      anchor: { x: 16, y: 31 },
      animations: {
        idle: { frames: [0], fps: 2, loop: true },
        walk: { frames: [0], fps: 6, loop: true },
        sleep: { frames: [0], fps: 1, loop: true },
      },
    },
    personality: { energy: 50, curiosity: 50, chattiness: 50, clinginess: 50, sleepiness: 50 },
    lines: { hello: ['Hello.'] },
    rules: [{
      id: 'say-hello',
      name: 'Say hello',
      enabled: true,
      when: 'user.click',
      if: [],
      then: [{ say: 'hello' }],
      cooldownSec: 1,
      priority: 1,
      weight: 1,
    }],
  };

  assert.throws(() => validateDeskPack({ ...pack, shell: 'unsafe' }), /pack\.shell: unknown field/);
  assert.throws(() => validateDeskPack({
    ...pack,
    buddy: { ...pack.buddy, sprite: 'sprites/..\\outside.png' },
  }), /pack\.buddy\.sprite: expected a PNG path/);
  assert.throws(() => validateDeskPack({
    ...pack,
    rules: [{ ...pack.rules[0], then: [{ run: 'cmd.exe' }] }],
  }), /pack\.rules: Rule "say-hello" contains an unsupported action/);
  assert.throws(() => validateDeskPack(`${' '.repeat(DESK_PACK_LIMITS.packBytes)}{}`), /exceeds the 20 MB size limit/);
});

test('desk-pack animation motion metadata validates transition support and timing', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../packs/sleepy-cat/pack.json', import.meta.url), 'utf8');
  const pack = JSON.parse(source);
  pack.buddy.motion = {
    timings: { anticipationMs: 120, settleMs: 180, impactMs: 220, unlockMs: 240 },
    supportedTransitions: ['idle-to-walk', 'pet', 'drop', 'unlock'],
  };
  assert.deepEqual(validateDeskPack(pack).buddy.motion, pack.buddy.motion);
  assert.throws(() => validateDeskPack({
    ...pack,
    buddy: { ...pack.buddy, motion: { timings: { impactMs: 401 } } },
  }), /0 to 400 ms/);
  assert.throws(() => validateDeskPack({
    ...pack,
    buddy: { ...pack.buddy, motion: { supportedTransitions: ['teleport'] } },
  }), /unknown or duplicate transition/);
  assert.throws(() => validateDeskPack({
    ...pack,
    buddy: { ...pack.buddy, motion: { supportedTransitions: ['pet', 'pet'] } },
  }), /unknown or duplicate transition/);
  assert.deepEqual(validateDeskPack({
    ...pack,
    buddy: { ...pack.buddy, paletteMap: { '#123456': 'buddy', '#ffffff': 'accent' } },
  }).buddy.paletteMap, { '#123456': 'buddy', '#ffffff': 'accent' });
  assert.throws(() => validateDeskPack({
    ...pack,
    buddy: { ...pack.buddy, paletteMap: { 'url(image)': 'buddy' } },
  }), /paletteMap: map six-digit hex colors/);
});

test('particle effects share one animation registration and never exceed the pool cap', () => {
  const calls = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      clearRect() {},
      setTransform() {},
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      beginPath() {},
      moveTo() {},
      bezierCurveTo() {},
      fill() {},
      fillRect() {},
      arc() {},
    }),
    getBoundingClientRect: () => ({ width: 100, height: 60 }),
  };
  const motion = {
    register(animation) {
      calls.push(animation);
      return () => calls.push('cancelled');
    },
  };
  const pool = createParticlePool({
    canvas,
    motion,
    getColor: (name) => name,
    random: () => 0.5,
  });
  for (let index = 0; index < 10; index += 1) pool.emit('heart', 20, 20);
  assert.equal(pool.getActiveCount(), PARTICLE_LIMITS.count);
  assert.equal(calls.length, 1);
  assert.throws(() => pool.emit('unknown', 0, 0), /Unknown particle effect/);
  pool.clear();
  assert.equal(pool.getActiveCount(), 0);
  assert.equal(calls.at(-1), 'cancelled');
});

test('pack sprite metadata enforces traversal, image size, dimensions, and frame bounds', () => {
  assert.equal(validatePackImageMetadata('sprites/test.png', 1024, 64, 64, 3), true);
  assert.throws(() => validatePackImageMetadata('sprites/../test.png', 1024, 64, 64, 3), /no traversal/);
  assert.throws(() => validatePackImageMetadata('sprites/test.png', DESK_PACK_LIMITS.imageBytes + 1, 64, 64, 3), /4 MB/);
  assert.throws(() => validatePackImageMetadata('sprites/test.png', 1024, 64, 64, 4), /contain every referenced frame/);
});

test('disabled modules are not loaded and enabled modules stop all owned work', async () => {
  const timers = new Set();
  const events = createEventBus();
  let loads = 0;
  let ticks = 0;
  let handled = 0;
  let disposed = false;
  globalThis.document = { getElementById: () => ({}) };
  const registry = new ModuleRegistry([
    {
      id: 'optional',
      panelId: 'p-optional',
      defaultEnabled: false,
      load: async () => {
        loads += 1;
        return {
          mount() {},
          unmount() {},
          start() {
            const timer = setInterval(() => { ticks += 1; }, 5);
            timers.add(timer);
            this.unsubscribe = events.on('test.changed', () => { handled += 1; });
          },
          stop() {
            clearInterval([...timers][0]);
            timers.clear();
            this.unsubscribe();
            disposed = true;
          },
        };
      },
    },
  ], {
    persistEnabled: async () => {},
    onChange() {},
  });

  await registry.initialize({ optional: false }, {});
  assert.equal(loads, 0);
  await registry.setEnabled('optional', true, {});
  assert.equal(loads, 1);
  events.emit('test.changed', {});
  assert.equal(handled, 1);
  await registry.setEnabled('optional', false, {});
  events.emit('test.changed', {});
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(handled, 1);
  assert.equal(ticks, 0);
  assert.equal(timers.size, 0);
  assert.equal(disposed, true);
  delete globalThis.document;
});

test('modules omitted from saved preferences stay disabled by default', async () => {
  let loads = 0;
  globalThis.document = { getElementById: () => ({}) };
  const registry = new ModuleRegistry([{
    id: 'optional',
    panelId: 'p-optional',
    defaultEnabled: false,
    load: async () => {
      loads += 1;
      return { mount() {}, unmount() {}, start() {}, stop() {} };
    },
  }], {
    persistEnabled: async () => {},
    onChange() {},
  });

  await registry.initialize({}, {});
  assert.equal(loads, 0);
  assert.equal(registry.list()[0].enabled, false);
  delete globalThis.document;
});

test('failed persistence rolls module startup back', async () => {
  let started = false;
  let stopped = false;
  globalThis.document = { getElementById: () => ({}) };
  const registry = new ModuleRegistry([
    {
      id: 'optional',
      panelId: 'p-optional',
      defaultEnabled: false,
      load: async () => ({
        mount() {},
        unmount() {},
        start() { started = true; },
        stop() { stopped = true; },
      }),
    },
  ], {
    persistEnabled: async () => { throw new Error('disk full'); },
    onChange() {},
  });

  await registry.initialize({ optional: false }, {});
  await assert.rejects(registry.setEnabled('optional', true, {}), /disk full/);
  assert.equal(started, true);
  assert.equal(stopped, true);
  assert.equal(registry.list()[0].enabled, false);
  delete globalThis.document;
});

test('failed startup stops modules that were already activated', async () => {
  let stopped = false;
  let unmounted = false;
  globalThis.document = { getElementById: () => ({}) };
  const registry = new ModuleRegistry([
    {
      id: 'first',
      panelId: 'p-first',
      defaultEnabled: true,
      load: async () => ({
        mount() {},
        unmount() { unmounted = true; },
        start() {},
        stop() { stopped = true; },
      }),
    },
    {
      id: 'broken',
      panelId: 'p-broken',
      defaultEnabled: true,
      load: async () => { throw new Error('module unavailable'); },
    },
  ], {
    persistEnabled: async () => {},
    onChange() {},
  });

  await assert.rejects(registry.initialize({}, {}), /module unavailable/);
  assert.equal(stopped, true);
  assert.equal(unmounted, true);
  assert.equal(registry.list()[0].enabled, false);
  delete globalThis.document;
});

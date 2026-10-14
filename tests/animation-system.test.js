import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ANIMATION_EFFECTS,
  DEFAULT_ANIMATION_SETTINGS,
  normalizeAnimationSettings,
  sampleSpringCurve,
} from '../src/core/animation-settings.js';
import { createBuddyStateMachine, BUDDY_STATES } from '../src/core/buddy-state.js';
import { createSpring } from '../src/core/motion.js';

test('animation preferences clamp tuning values and validate effect switches', () => {
  const settings = normalizeAnimationSettings({
    speedMultiplier: 0.1,
    stiffness: 1500,
    bounciness: -1,
    slowMotionMultiplier: 0.01,
  });
  assert.equal(settings.speedMultiplier, 0.5);
  assert.equal(settings.stiffness, 1000);
  assert.equal(settings.bounciness, 0);
  assert.equal(settings.slowMotionMultiplier, 0.1);
  assert.deepEqual(settings.effects, ANIMATION_EFFECTS);
  assert.equal(DEFAULT_ANIMATION_SETTINGS.schemaVersion, 2);
  assert.equal(normalizeAnimationSettings({ schemaVersion: 1 }).ecoMode, false);
  assert.throws(() => normalizeAnimationSettings({ ecoMode: 'yes' }), /boolean/);
  assert.throws(() => normalizeAnimationSettings({ intensity: 'wild' }), /intensity/);
  assert.throws(() => normalizeAnimationSettings({ effects: { surprise: true } }), /unknown effect/);
  assert.throws(() => normalizeAnimationSettings({ effects: { particles: 'yes' } }), /boolean/);
});

test('spring lab samples remain finite and converge toward rest', () => {
  const samples = sampleSpringCurve(createSpring, {
    stiffness: 760,
    bounciness: 0.65,
    durationSeconds: 0.8,
    samples: 96,
  });
  assert.equal(samples.length, 96);
  assert.ok(samples.every(({ time, displacement, velocity }) =>
    [time, displacement, velocity].every(Number.isFinite)));
  assert.ok(Math.abs(samples.at(-1).displacement - 1) < 0.02);
});

test('buddy state machine accepts listed states and guards hidden-state recovery', () => {
  const transitions = [];
  const machine = createBuddyStateMachine('idle', (transition) => transitions.push(transition));
  for (const state of ['walking', 'reacting', 'falling', 'idle', 'hidden']) {
    machine.transition(state);
  }
  assert.equal(machine.state, 'hidden');
  assert.throws(() => machine.transition('walking'), /not allowed/);
  assert.equal(machine.transition('idle'), true);
  assert.deepEqual(transitions.map(({ state }) => state), [
    'walking', 'reacting', 'falling', 'idle', 'hidden', 'idle',
  ]);
  assert.deepEqual(BUDDY_STATES, [
    'idle', 'walking', 'sitting', 'sleeping', 'reacting', 'carried', 'falling', 'hidden',
  ]);
  assert.throws(() => createBuddyStateMachine('napping'), /Unknown buddy state/);
});

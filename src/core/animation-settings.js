import { SPRING_LIMITS } from './motion-tokens.js';

export const ANIMATION_EFFECTS = Object.freeze({
  buddyMovement: true,
  buddyAnimation: true,
  softWindowJelly: true,
  windowOpenClose: true,
  hideToTray: true,
  elasticResize: true,
  buddyTransitions: true,
  buddyImpacts: true,
  stickerMotion: true,
  particles: true,
});

export const DEFAULT_ANIMATION_SETTINGS = Object.freeze({
  schemaVersion: 2,
  ecoMode: false,
  intensity: 'calm',
  speedMultiplier: 1,
  stiffness: 900,
  bounciness: 0.5,
  slowMotionMultiplier: 1,
  effects: Object.freeze({ ...ANIMATION_EFFECTS }),
});

const clamp = (value, [minimum, maximum]) =>
  Math.max(minimum, Math.min(maximum, value));

function finiteValue(value, fallback, range, name) {
  const number = value === undefined ? fallback : value;
  if (!Number.isFinite(number)) throw new TypeError(`${name} must be a finite number.`);
  return clamp(number, range);
}

export function normalizeAnimationSettings(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Animation settings must be an object.');
  }
  const allowed = new Set(Object.keys(DEFAULT_ANIMATION_SETTINGS));
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new TypeError('Animation settings contain an unknown field.');
  }
  if (value.schemaVersion !== undefined && ![1, 2].includes(value.schemaVersion)) {
    throw new TypeError('Animation settings schemaVersion must be 1 or 2.');
  }
  if (value.ecoMode !== undefined && typeof value.ecoMode !== 'boolean') {
    throw new TypeError('Eco mode must be a boolean.');
  }
  const intensity = value.intensity ?? DEFAULT_ANIMATION_SETTINGS.intensity;
  if (!['off', 'calm', 'lively'].includes(intensity)) {
    throw new TypeError('Animation intensity must be off, calm, or lively.');
  }
  const providedEffects = value.effects ?? {};
  if (!providedEffects || typeof providedEffects !== 'object' || Array.isArray(providedEffects)) {
    throw new TypeError('Animation effects must be an object.');
  }
  if (Object.keys(providedEffects).some((key) => !Object.hasOwn(ANIMATION_EFFECTS, key))) {
    throw new TypeError('Animation effects contain an unknown effect.');
  }
  const effects = { ...ANIMATION_EFFECTS };
  for (const [key, enabled] of Object.entries(providedEffects)) {
    if (typeof enabled !== 'boolean') throw new TypeError(`${key} must be a boolean.`);
    effects[key] = enabled;
  }
  return Object.freeze({
    schemaVersion: 2,
    ecoMode: value.ecoMode ?? DEFAULT_ANIMATION_SETTINGS.ecoMode,
    intensity,
    speedMultiplier: finiteValue(
      value.speedMultiplier,
      DEFAULT_ANIMATION_SETTINGS.speedMultiplier,
      SPRING_LIMITS.speedMultiplier,
      'Animation speed multiplier',
    ),
    stiffness: finiteValue(
      value.stiffness,
      DEFAULT_ANIMATION_SETTINGS.stiffness,
      [100, SPRING_LIMITS.stiffness[1]],
      'Animation stiffness',
    ),
    bounciness: finiteValue(
      value.bounciness,
      DEFAULT_ANIMATION_SETTINGS.bounciness,
      SPRING_LIMITS.bounciness,
      'Animation bounciness',
    ),
    slowMotionMultiplier: finiteValue(
      value.slowMotionMultiplier,
      DEFAULT_ANIMATION_SETTINGS.slowMotionMultiplier,
      [0.1, 1],
      'Slow-motion multiplier',
    ),
    effects: Object.freeze(effects),
  });
}

export function sampleSpringCurve(springFactory, {
  stiffness = DEFAULT_ANIMATION_SETTINGS.stiffness,
  bounciness = DEFAULT_ANIMATION_SETTINGS.bounciness,
  durationSeconds = 0.8,
  samples = 64,
} = {}) {
  if (typeof springFactory !== 'function') throw new TypeError('Spring factory must be callable.');
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0
    || !Number.isInteger(samples) || samples < 2 || samples > 512) {
    throw new RangeError('Spring curve sample bounds are invalid.');
  }
  const spring = springFactory({
    preset: 'Default',
    stiffness,
    bounciness,
    position: 0,
    target: 1,
    minimum: -0.2,
    maximum: 1.2,
  });
  const delta = durationSeconds / (samples - 1);
  return Object.freeze(Array.from({ length: samples }, (_, index) => {
    const snapshot = spring.advance(index === 0 ? 0 : delta);
    return Object.freeze({
      time: index * delta,
      displacement: snapshot.position,
      velocity: snapshot.velocity,
    });
  }));
}

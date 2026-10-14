export const MOTION_TOKENS = Object.freeze({
  durationMs: Object.freeze({
    micro: 120,
    panel: 240,
    window: 360,
  }),
  easing: Object.freeze({
    fade: 'cubic-bezier(0.2, 0, 0, 1)',
  }),
  springs: Object.freeze({
    Calm: Object.freeze({ stiffness: 1000, damping: 44.7, mass: 0.5 }),
    Default: Object.freeze({ stiffness: 900, damping: 38, mass: 0.5 }),
    Lively: Object.freeze({ stiffness: 1000, damping: 24, mass: 0.25 }),
  }),
  frameRate: Object.freeze({
    normal: 60,
    eco: 30,
    reducedBuddyIdle: 2,
    buddyIdleMax: 6,
  }),
});

export function applyMotionCssTokens(
  style,
  { enabled = true, speedMultiplier = 1, slowMotionMultiplier = 1 } = {},
) {
  if (!style || typeof style.setProperty !== 'function') {
    throw new TypeError('Motion CSS tokens require a style declaration.');
  }
  if (typeof enabled !== 'boolean') throw new TypeError('Motion enabled state must be a boolean.');
  if (!Number.isFinite(speedMultiplier)) throw new TypeError('Speed multiplier must be finite.');
  if (!Number.isFinite(slowMotionMultiplier)) {
    throw new TypeError('Slow-motion multiplier must be finite.');
  }
  const speed = Math.max(
    SPRING_LIMITS.speedMultiplier[0],
    Math.min(SPRING_LIMITS.speedMultiplier[1], speedMultiplier),
  );
  const slowdown = Math.max(0.1, Math.min(1, slowMotionMultiplier));
  const duration = (value) => `${enabled ? value / speed / slowdown : 0}ms`;
  style.setProperty('--motion-duration-micro', duration(MOTION_TOKENS.durationMs.micro));
  style.setProperty('--motion-duration-panel', duration(MOTION_TOKENS.durationMs.panel));
  style.setProperty('--motion-duration-window', duration(MOTION_TOKENS.durationMs.window));
  style.setProperty('--motion-easing-fade', MOTION_TOKENS.easing.fade);
}

export const SPRING_LIMITS = Object.freeze({
  stiffness: Object.freeze([1, 1000]),
  damping: Object.freeze([0, 100]),
  mass: Object.freeze([0.25, 10]),
  speedMultiplier: Object.freeze([0.5, 2]),
  bounciness: Object.freeze([0, 1]),
});

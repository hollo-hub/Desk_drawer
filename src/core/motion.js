import { MOTION_TOKENS, SPRING_LIMITS } from './motion-tokens.js';

const FIXED_STEP_SECONDS = 1 / 120;
const MAX_FRAME_DELTA_SECONDS = 0.25;
const MAX_SPRING_VELOCITY = 10_000;
const MAX_SPRING_ACCELERATION = 1_000_000;
const VALID_INTENSITIES = new Set(['off', 'calm', 'lively']);

function finiteNumber(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number.`);
  return value;
}

function clamp(value, [minimum, maximum]) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function normalizeMotionSettings(settings = {}) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new TypeError('Motion settings must be an object.');
  }
  const intensity = settings.intensity ?? 'calm';
  if (!VALID_INTENSITIES.has(intensity)) {
    throw new TypeError('Motion intensity must be off, calm, or lively.');
  }
  const speedMultiplier = settings.speedMultiplier === undefined
    ? 1
    : clamp(finiteNumber(settings.speedMultiplier, 'Speed multiplier'), SPRING_LIMITS.speedMultiplier);
  const bounciness = settings.bounciness === undefined
    ? 0.5
    : clamp(finiteNumber(settings.bounciness, 'Bounciness'), SPRING_LIMITS.bounciness);
  const slowMotionMultiplier = settings.slowMotionMultiplier === undefined
    ? 1
    : clamp(finiteNumber(settings.slowMotionMultiplier, 'Slow-motion multiplier'), [0.1, 1]);
  const preset = intensity === 'lively' ? MOTION_TOKENS.springs.Lively : MOTION_TOKENS.springs.Calm;
  const stiffness = settings.stiffness === undefined
    ? preset.stiffness
    : clamp(finiteNumber(settings.stiffness, 'Spring stiffness'), SPRING_LIMITS.stiffness);
  return Object.freeze({
    intensity,
    speedMultiplier,
    stiffness,
    bounciness,
    slowMotionMultiplier,
  });
}

function finiteBound(value, fallback, name) {
  if (value === undefined) return fallback;
  if (value === Infinity || value === -Infinity) return value;
  return finiteNumber(value, name);
}

export function createSpring(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Spring options must be an object.');
  }
  const preset = options.preset === undefined
    ? MOTION_TOKENS.springs.Default
    : MOTION_TOKENS.springs[options.preset];
  if (!preset) throw new TypeError(`Unknown spring preset: ${options.preset}`);

  const stiffness = clamp(
    finiteNumber(options.stiffness ?? preset.stiffness, 'Spring stiffness'),
    SPRING_LIMITS.stiffness,
  );
  const mass = clamp(
    finiteNumber(options.mass ?? preset.mass, 'Spring mass'),
    SPRING_LIMITS.mass,
  );
  const bounciness = options.bounciness === undefined
    ? null
    : clamp(finiteNumber(options.bounciness, 'Spring bounciness'), SPRING_LIMITS.bounciness);
  const defaultDamping = bounciness === null
    ? preset.damping
    : 2 * Math.sqrt(stiffness * mass) * (1 - bounciness * 0.9);
  const damping = clamp(
    finiteNumber(options.damping ?? defaultDamping, 'Spring damping'),
    SPRING_LIMITS.damping,
  );
  const minimum = finiteBound(options.minimum, -Infinity, 'Spring minimum');
  const maximum = finiteBound(options.maximum, Infinity, 'Spring maximum');
  if (minimum > maximum) throw new RangeError('Spring minimum must not exceed its maximum.');

  const positionTolerance = Math.max(
    0,
    finiteNumber(options.positionTolerance ?? 0.01, 'Spring position tolerance'),
  );
  const velocityTolerance = Math.max(
    0,
    finiteNumber(options.velocityTolerance ?? 0.1, 'Spring velocity tolerance'),
  );
  const maxDelta = clamp(
    finiteNumber(options.maxDelta ?? MAX_FRAME_DELTA_SECONDS, 'Maximum spring delta'),
    [FIXED_STEP_SECONDS, 1],
  );
  let position = clamp(
    finiteNumber(options.position ?? 0, 'Spring position'),
    [minimum, maximum],
  );
  let target = clamp(finiteNumber(options.target ?? 0, 'Spring target'), [minimum, maximum]);
  let velocity = clamp(
    finiteNumber(options.velocity ?? 0, 'Spring velocity'),
    [-MAX_SPRING_VELOCITY, MAX_SPRING_VELOCITY],
  );
  let accumulator = 0;

  const snapshot = () => ({
    position,
    velocity,
    target,
    settled: Math.abs(target - position) <= positionTolerance
      && Math.abs(velocity) <= velocityTolerance,
  });

  return {
    snapshot,
    setTarget(value) {
      target = clamp(finiteNumber(value, 'Spring target'), [minimum, maximum]);
    },
    advance(deltaSeconds) {
      const delta = finiteNumber(deltaSeconds, 'Frame delta');
      if (delta < 0) throw new RangeError('Frame delta must not be negative.');
      accumulator += Math.min(delta, maxDelta);
      while (accumulator >= FIXED_STEP_SECONDS) {
        const acceleration = clamp(
          (-stiffness * (position - target) - damping * velocity) / mass,
          [-MAX_SPRING_ACCELERATION, MAX_SPRING_ACCELERATION],
        );
        velocity = clamp(
          velocity + acceleration * FIXED_STEP_SECONDS,
          [-MAX_SPRING_VELOCITY, MAX_SPRING_VELOCITY],
        );
        const nextPosition = position + velocity * FIXED_STEP_SECONDS;
        if (nextPosition < minimum || nextPosition > maximum) {
          position = clamp(nextPosition, [minimum, maximum]);
          velocity = 0;
        } else {
          position = nextPosition;
        }
        accumulator -= FIXED_STEP_SECONDS;
        if (Math.abs(target - position) <= positionTolerance
          && Math.abs(velocity) <= velocityTolerance) {
          position = target;
          velocity = 0;
          accumulator = 0;
          break;
        }
      }
      return snapshot();
    },
  };
}

export function createMotionEngine({
  documentRef = globalThis.document,
  reducedMotionQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null,
  requestFrame = (callback) => globalThis.requestAnimationFrame(callback),
  cancelFrame = (handle) => globalThis.cancelAnimationFrame(handle),
  setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimer = (handle) => globalThis.clearTimeout(handle),
  now = () => globalThis.performance.now(),
  onError = (error) => console.error('Motion callback failed:', error),
} = {}) {
  if (typeof requestFrame !== 'function' || typeof cancelFrame !== 'function'
    || typeof setTimer !== 'function' || typeof clearTimer !== 'function'
    || typeof now !== 'function' || typeof onError !== 'function') {
    throw new TypeError('Motion engine scheduling functions must be callable.');
  }

  let settings = normalizeMotionSettings();
  let ecoMode = false;
  let reducedMotion = Boolean(reducedMotionQuery?.matches);
  let visible = documentRef?.visibilityState !== 'hidden';
  let disposed = false;
  let frameHandle = null;
  let timerHandle = null;
  let lastFrameAt = null;
  let expectedFrameIntervalMs = 1000 / MOTION_TOKENS.frameRate.normal;
  let frameWorkMs = 0;
  let averageFrameWorkMs = 0;
  let frameIntervalMs = 0;
  let averageFrameIntervalMs = 0;
  let droppedFrames = 0;
  let totalFrames = 0;
  let nextId = 0;
  const animations = new Map();
  const frameCallbacks = new Map();

  const reportError = (error) => {
    try {
      onError(error);
    } catch (reportingError) {
      console.error('Motion error handler failed:', reportingError, 'Original error:', error);
    }
  };

  const canAnimate = (kind) => {
    if (settings.intensity === 'off') return false;
    if (reducedMotion || ecoMode) return kind === 'buddy-idle';
    return true;
  };

  const effectiveFps = (animation) => {
    if ((reducedMotion || ecoMode) && animation.kind === 'buddy-idle') {
      return Math.min(animation.fps, MOTION_TOKENS.frameRate.reducedBuddyIdle);
    }
    const systemLimit = ecoMode
      ? MOTION_TOKENS.frameRate.eco
      : MOTION_TOKENS.frameRate.normal;
    return Math.min(animation.fps, systemLimit);
  };

  const markAnimating = (animation) => {
    const { element } = animation;
    if (!element || animation.originalWillChange !== null) return;
    animation.originalWillChange = element.style.willChange;
    element.style.willChange = 'transform, opacity';
  };

  const clearAnimating = (animation) => {
    if (!animation.element || animation.originalWillChange === null) return;
    animation.element.style.willChange = animation.originalWillChange;
    animation.originalWillChange = null;
  };

  const stopAnimation = (id, reason) => {
    const animation = animations.get(id);
    if (!animation) return false;
    animations.delete(id);
    clearAnimating(animation);
    if (animation.onStop) {
      try {
        animation.onStop(reason);
      } catch (error) {
        reportError(error);
      }
    }
    if (animations.size === 0 && frameCallbacks.size === 0) cancelScheduledWork();
    return true;
  };

  const cancelScheduledWork = () => {
    if (frameHandle !== null) {
      cancelFrame(frameHandle);
      frameHandle = null;
    }
    if (timerHandle !== null) {
      clearTimer(timerHandle);
      timerHandle = null;
    }
  };

  let schedule;
  const runFrame = (timestamp) => {
    frameHandle = null;
    if (disposed || !visible) return;
    const frameTime = Number.isFinite(timestamp) ? timestamp : now();
    const previousFrameAt = lastFrameAt;
    const workStartedAt = now();
    if (previousFrameAt !== null) {
      const interval = frameTime - previousFrameAt;
      frameIntervalMs = interval;
      averageFrameIntervalMs = averageFrameIntervalMs === 0
        ? interval
        : averageFrameIntervalMs * 0.8 + interval * 0.2;
      if (interval > expectedFrameIntervalMs * 1.5) {
        droppedFrames += Math.max(1, Math.floor(interval / expectedFrameIntervalMs) - 1);
      }
    }
    lastFrameAt = frameTime;
    totalFrames += 1;

    const pendingCallbacks = [...frameCallbacks.values()];
    frameCallbacks.clear();
    for (const callback of pendingCallbacks) {
      try {
        callback(frameTime);
      } catch (error) {
        reportError(error);
      }
    }

    for (const animation of [...animations.values()]) {
      if (!canAnimate(animation.kind)) {
        stopAnimation(animation.id, 'motion policy');
        continue;
      }
      const animationDelta = animation.lastUpdateAt === null
        ? 0
        : Math.min(Math.max((frameTime - animation.lastUpdateAt) / 1000, 0), MAX_FRAME_DELTA_SECONDS);
      if (animation.lastUpdateAt !== null && animationDelta * 1000 < 1000 / effectiveFps(animation)) {
        continue;
      }
      animation.lastUpdateAt = frameTime;
      const speedDelta = animationDelta * settings.speedMultiplier * settings.slowMotionMultiplier;
      try {
        if (animation.update({
          deltaSeconds: speedDelta,
          elapsedSeconds: animation.elapsedSeconds,
          frameTime,
          speedMultiplier: settings.speedMultiplier,
          intensity: settings.intensity,
          stiffness: settings.stiffness,
          bounciness: settings.bounciness,
        }) === false) {
          stopAnimation(animation.id, 'completed');
        } else {
          animation.elapsedSeconds += speedDelta;
        }
      } catch (error) {
        stopAnimation(animation.id, 'error');
        reportError(error);
      }
    }
    frameWorkMs = Math.max(0, now() - workStartedAt);
    averageFrameWorkMs = totalFrames === 1
      ? frameWorkMs
      : averageFrameWorkMs * 0.8 + frameWorkMs * 0.2;
    schedule();
  };

  schedule = () => {
    if (disposed || !visible || frameHandle !== null || timerHandle !== null) return;
    const eligible = [...animations.values()].filter((animation) => canAnimate(animation.kind));
    if (eligible.length === 0 && frameCallbacks.size === 0) return;
    const targetFps = eligible.length
      ? Math.max(...eligible.map(effectiveFps))
      : MOTION_TOKENS.frameRate.normal;
    expectedFrameIntervalMs = 1000 / targetFps;
    const delay = lastFrameAt === null
      ? 0
      : Math.max(0, 1000 / targetFps - (now() - lastFrameAt));
    const request = () => {
      timerHandle = null;
      if (!disposed && visible && frameHandle === null) frameHandle = requestFrame(runFrame);
    };
    if (delay > 1) timerHandle = setTimer(request, delay);
    else request();
  };
  const reschedule = () => {
    if (timerHandle !== null) {
      clearTimer(timerHandle);
      timerHandle = null;
    }
    schedule();
  };

  const onVisibilityChange = () => {
    visible = documentRef.visibilityState !== 'hidden';
    if (!visible) {
      cancelScheduledWork();
      lastFrameAt = null;
      for (const animation of animations.values()) {
        clearAnimating(animation);
        animation.lastUpdateAt = null;
      }
      return;
    }
    for (const animation of animations.values()) {
      markAnimating(animation);
      animation.lastUpdateAt = null;
    }
    lastFrameAt = null;
    schedule();
  };
  const onPageHide = () => {
    visible = false;
    cancelScheduledWork();
    lastFrameAt = null;
    for (const animation of animations.values()) {
      clearAnimating(animation);
      animation.lastUpdateAt = null;
    }
  };
  const onPageShow = () => {
    visible = documentRef?.visibilityState !== 'hidden';
    if (visible) {
      for (const animation of animations.values()) {
        markAnimating(animation);
        animation.lastUpdateAt = null;
      }
      lastFrameAt = null;
      schedule();
    }
  };
  const onReducedMotionChange = (event) => {
    reducedMotion = Boolean(event.matches);
    for (const animation of [...animations.values()]) {
      if (!canAnimate(animation.kind)) stopAnimation(animation.id, 'motion policy');
    }
    schedule();
  };

  documentRef?.addEventListener('visibilitychange', onVisibilityChange);
  globalThis.addEventListener?.('pagehide', onPageHide);
  globalThis.addEventListener?.('pageshow', onPageShow);
  reducedMotionQuery?.addEventListener?.('change', onReducedMotionChange);

  return {
    register({
      id = `motion-${++nextId}`,
      update,
      kind = 'ui',
      fps = MOTION_TOKENS.frameRate.normal,
      element = null,
      onStop = null,
    }) {
      if (disposed) throw new Error('Cannot register motion after the engine is disposed.');
      if (typeof id !== 'string' || !id.trim()) throw new TypeError('Animation id must be a non-empty string.');
      if (animations.has(id)) throw new Error(`Animation "${id}" is already registered.`);
      if (typeof update !== 'function') throw new TypeError('Animation update must be callable.');
      if (typeof kind !== 'string' || !kind.trim()) throw new TypeError('Animation kind must be a non-empty string.');
      if (!Number.isFinite(fps) || fps <= 0) throw new TypeError('Animation frame rate must be positive and finite.');
      if (onStop !== null && typeof onStop !== 'function') throw new TypeError('Animation onStop must be callable.');
      const animation = {
        id,
        update,
        kind,
        fps: clamp(fps, [1, MOTION_TOKENS.frameRate.normal]),
        element,
        onStop,
        lastUpdateAt: null,
        elapsedSeconds: 0,
        originalWillChange: null,
      };
      animations.set(id, animation);
      if (visible && canAnimate(kind)) markAnimating(animation);
      reschedule();
      return () => stopAnimation(id, 'cancelled');
    },
    scheduleFrame(callback) {
      if (disposed) throw new Error('Cannot schedule a frame after the engine is disposed.');
      if (typeof callback !== 'function') throw new TypeError('Frame callback must be callable.');
      const id = ++nextId;
      frameCallbacks.set(id, callback);
      reschedule();
      return () => {
        const removed = frameCallbacks.delete(id);
        if (removed && animations.size === 0 && frameCallbacks.size === 0) cancelScheduledWork();
        return removed;
      };
    },
    setFps(id, fps) {
      const animation = animations.get(id);
      if (!animation) throw new Error(`Animation "${id}" is not registered.`);
      if (!Number.isFinite(fps) || fps <= 0) {
        throw new TypeError('Animation frame rate must be positive and finite.');
      }
      const nextFps = clamp(fps, [1, MOTION_TOKENS.frameRate.normal]);
      if (animation.fps === nextFps) return;
      animation.fps = nextFps;
      reschedule();
    },
    setSettings(nextSettings) {
      const merged = { ...settings, ...nextSettings };
      if (Object.hasOwn(nextSettings, 'intensity') && !Object.hasOwn(nextSettings, 'stiffness')) {
        delete merged.stiffness;
      }
      settings = normalizeMotionSettings(merged);
      for (const animation of [...animations.values()]) {
        if (!canAnimate(animation.kind)) stopAnimation(animation.id, 'motion policy');
      }
      reschedule();
    },
    setEnvironment({ ecoMode: nextEcoMode = ecoMode, reducedMotion: nextReducedMotion = reducedMotion } = {}) {
      if (typeof nextEcoMode !== 'boolean' || typeof nextReducedMotion !== 'boolean') {
        throw new TypeError('Eco mode and reduced-motion state must be booleans.');
      }
      ecoMode = nextEcoMode;
      reducedMotion = nextReducedMotion;
      for (const animation of [...animations.values()]) {
        if (!canAnimate(animation.kind)) stopAnimation(animation.id, 'motion policy');
      }
      reschedule();
    },
    canAnimate,
    getActive() {
      return [...animations.values()].map((animation) => ({
        id: animation.id,
        kind: animation.kind,
        fps: animation.fps,
        effectiveFps: canAnimate(animation.kind) ? effectiveFps(animation) : 0,
        elapsedSeconds: animation.elapsedSeconds,
      }));
    },
    getDiagnostics() {
      return Object.freeze({
        active: [...animations.values()].map((animation) => Object.freeze({
          id: animation.id,
          kind: animation.kind,
          effectiveFps: canAnimate(animation.kind) ? effectiveFps(animation) : 0,
        })),
        frameWorkMs,
        averageFrameWorkMs,
        frameIntervalMs,
        averageFrameIntervalMs,
        droppedFrames,
        totalFrames,
      });
    },
    getPolicy() {
      return Object.freeze({
        ...settings,
        ecoMode,
        reducedMotion,
        maxFps: ecoMode ? MOTION_TOKENS.frameRate.eco : MOTION_TOKENS.frameRate.normal,
        visible,
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelScheduledWork();
      for (const id of [...animations.keys()]) stopAnimation(id, 'disposed');
      frameCallbacks.clear();
      documentRef?.removeEventListener('visibilitychange', onVisibilityChange);
      globalThis.removeEventListener?.('pagehide', onPageHide);
      globalThis.removeEventListener?.('pageshow', onPageShow);
      reducedMotionQuery?.removeEventListener?.('change', onReducedMotionChange);
    },
  };
}

export const MOTION_FRAME_LIMITS = Object.freeze({
  fixedStepSeconds: FIXED_STEP_SECONDS,
  maxFrameDeltaSeconds: MAX_FRAME_DELTA_SECONDS,
});

import {
  createPlaceholderSpriteSheet,
  drawSpriteFrame,
  resolvePackAnimationFrame,
} from '../../core/sprite-sheet.js';
import { createSpring } from '../../core/motion.js';
import { createBehaviorEngine, driftMood, wanderProbability } from '../../core/behavior-engine.js';
import { DEFAULT_BUDDY_RULES } from '../../core/default-rules.js';
import { parseThemeColor } from '../../core/theme.js';
import { createBuddyStateMachine } from '../../core/buddy-state.js';

let panel;
let ctx;
let cleanup = [];
let cancelBuddyAnimation;
let lastBuddyTickAt = null;
let reminderTimer;
let countdownTimer;
let dialogueTimer;
let state;
let calm;
let mediaQuery;
let spriteSheet;
let activeSpriteImage;
let behavior;
let mood;
let personality;
let defaultPersonality;
let moodTimer;
let reactionUntil = 0;
let focusActive = false;
let developerClockHour = null;
let developerSnapshotTimer;
let developerFrameCount = 0;
let buddyDrag = null;
let buddyStateMachine;
let reactionTimer;
let fallTimer;

let activePackDef = null;
let activeSpriteAnimationName = null;
let activeSpriteAnimationStartedAt = 0;

const MOTION_TRANSITIONS = new Set([
  'idle-to-walk', 'walk-to-idle', 'pickup', 'drop', 'pet', 'settle', 'sticker-drop', 'unlock',
]);

function supportsTransition(name) {
  const supported = activePackDef?.buddy.motion?.supportedTransitions;
  return !supported || supported.includes(name);
}

function transitionDuration(type, fallback) {
  const key = `${type}Ms`;
  const value = activePackDef?.buddy.motion?.timings?.[key];
  return Number.isInteger(value) ? value : fallback;
}

function createBuddySpring(options) {
  const settings = ctx.animationSettings?.() ?? {};
  return createSpring({
    ...options,
    stiffness: options.stiffness ?? settings.stiffness,
    bounciness: options.bounciness ?? settings.bounciness,
  });
}

function baseBuddyAnimation() {
  return state.mode === 'carried' ? 'carried'
    : state.mode === 'falling' ? 'fall'
      : state.mode === 'hidden' ? 'idle'
    : state.mode === 'nap' ? 'sleep'
    : state.mode === 'bubble' ? 'happy'
    : state.mode === 'walk' || state.mode === 'break' ? 'walk'
      : state.mode === 'sit' ? 'sit' : 'idle';
}

function requestedBuddyAnimation(now = Date.now()) {
  const baseMode = baseBuddyAnimation();
  const requestedMode = state.reactionAnimation && now < reactionUntil
    ? state.reactionAnimation
    : baseMode;
  if (!activePackDef || activePackDef.buddy.animations[requestedMode]) return requestedMode;
  return baseMode === 'walk' ? 'walk' : 'idle';
}

function setBuddyMode(mode, transition = null) {
  const changed = state.mode !== mode;
  if (!changed) return;
  buddyStateMachine?.transition(stateForActivity(mode));
  const allowed = transition && MOTION_TRANSITIONS.has(transition)
    && supportsTransition(transition)
    && ctx.animationEffects?.().buddyTransitions !== false
    && ctx.motion.canAnimate('ui')
    && !ctx.motion.getPolicy().ecoMode;
  const currentCanvas = document.querySelector('#buddy');
  const previousCanvas = document.querySelector('#buddyPrevious');
  if (allowed && currentCanvas && previousCanvas) {
    const previousContext = previousCanvas.getContext('2d');
    previousContext.clearRect(0, 0, previousCanvas.width, previousCanvas.height);
    previousContext.drawImage(currentCanvas, 0, 0);
    previousCanvas.style.setProperty(
      '--buddy-transition-duration',
      `${transitionDuration(transition === 'idle-to-walk' ? 'anticipation' : 'settle', 140)}ms`,
    );
    previousCanvas.classList.remove('blend');
  }
  state.mode = mode;
  document.querySelector('#buddyWrap').hidden = mode === 'hidden';
  state.frame = 0;
  activeSpriteAnimationName = null;
  draw();
  updateBuddyFps();
  if (allowed && previousCanvas) {
    void previousCanvas.offsetWidth;
    previousCanvas.classList.add('blend');
  }
}

function setReactionAnimation(animation, durationMs) {
  clearTimeout(reactionTimer);
  state.reactionAnimation = animation;
  reactionUntil = Date.now() + durationMs;
  if (animation && durationMs > 0) {
    buddyStateMachine?.transition('reacting');
    reactionTimer = setTimeout(() => {
      state.reactionAnimation = null;
      reactionUntil = 0;
      buddyStateMachine?.transition(stateForActivity(state.mode));
      activeSpriteAnimationName = null;
      updateBuddyFps();
      draw();
    }, durationMs);
  } else {
    buddyStateMachine?.transition(stateForActivity(state.mode));
  }
  activeSpriteAnimationName = null;
  updateBuddyFps();
}

function stateForActivity(mode) {
  return ({
    idle: 'idle',
    walk: 'walking',
    sit: 'sitting',
    nap: 'sleeping',
    bubble: 'reacting',
    break: 'walking',
    carried: 'carried',
    falling: 'falling',
    hidden: 'hidden',
  })[mode] ?? 'idle';
}

function animateBuddyImpact(type) {
  if (ctx.animationEffects?.().buddyImpacts === false
    || !supportsTransition(type)
    || !ctx.motion.canAnimate('ui')
    || ctx.motion.getPolicy().ecoMode) return;
  const stiffness = ctx.animationSettings?.().stiffness ?? 900;
  const element = document.querySelector('#buddyWrap');
  const scaleX = createBuddySpring({
    preset: 'Lively',
    stiffness,
    position: type === 'pet' ? 1.16 : type === 'pickup' ? 0.9 : type === 'settle' ? 1.07 : 0.84,
    target: 1,
    minimum: 0.78,
    maximum: 1.2,
  });
  const scaleY = createBuddySpring({
    preset: 'Lively',
    stiffness,
    position: type === 'pet' ? 0.88 : type === 'pickup' ? 1.12 : type === 'settle' ? 0.94 : 1.16,
    target: 1,
    minimum: 0.78,
    maximum: 1.2,
  });
  cancelBuddyImpact?.();
  cancelBuddyImpact = ctx.motion.register({
    id: 'buddy-impact',
    kind: 'ui',
    element,
    update({ deltaSeconds }) {
      const x = scaleX.advance(deltaSeconds);
      const y = scaleY.advance(deltaSeconds);
      element.style.setProperty('--buddy-impact-x', String(x.position));
      element.style.setProperty('--buddy-impact-y', String(y.position));
      return !(x.settled && y.settled);
    },
    onStop() {
      element.style.removeProperty('--buddy-impact-x');
      element.style.removeProperty('--buddy-impact-y');
      cancelBuddyImpact = null;
    },
  });
}

let cancelBuddyImpact;

function createBuddyBehavior(rules) {
  return createBehaviorEngine(rules, {
    onTrace(trace) {
      if (ctx?.isDeveloperMode?.()) ctx.events.emit('buddy.developer.rule-trace', trace);
    },
  });
}

function usesSharedBehaviorRules() {
  return activePackDef?.id.startsWith('custom-') ?? false;
}

function emitDeveloperSnapshot() {
  if (!ctx?.isDeveloperMode?.() || !mood || !state) return;
  ctx.events.emit('buddy.developer.snapshot', {
    state: buddyStateMachine?.state ?? 'idle',
    activity: state.mode,
    energy: Math.round(mood.energy),
    mood: Math.round(mood.mood),
    curiosity: Math.round(mood.curiosity),
    fps: developerFrameCount,
    sensors: JSON.stringify(ctx.buddySensors ?? {}),
  });
  developerFrameCount = 0;
}

function draw() {
  const canvas = document.querySelector('#buddy');
  const context = canvas.getContext('2d');
  const lowMotion = calm || ctx.motion.getPolicy().ecoMode;
  const now = performance.now();
  const mode = requestedBuddyAnimation();
  if (mode !== activeSpriteAnimationName) {
    activeSpriteAnimationName = mode;
    activeSpriteAnimationStartedAt = now;
  }
  const animation = activePackDef?.buddy.animations[mode];
  const frame = lowMotion || ctx.animationEffects?.().buddyAnimation === false ? 0 : animation
    ? resolvePackAnimationFrame(animation, Math.max(0, now - activeSpriteAnimationStartedAt)).sequenceIndex
    : state.frame;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (spriteSheet) {
    context.imageSmoothingEnabled = false;
    drawSpriteFrame(context, spriteSheet, mode, frame, 0, 0, canvas.width, canvas.height, activePackDef);
  }
}

function refreshSpritePalette() {
  if (activePackDef) {
    const followsTheme = document.documentElement.dataset.buddyFollowsTheme === 'true';
    const paletteMap = activePackDef.buddy.paletteMap;
    if (!followsTheme || !paletteMap || !activeSpriteImage) {
      spriteSheet = activeSpriteImage;
      draw();
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = activeSpriteImage.naturalWidth;
    canvas.height = activeSpriteImage.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(activeSpriteImage, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const styles = getComputedStyle(document.documentElement);
    const replacements = new Map(Object.entries(paletteMap).map(([source, target]) => {
      const rgb = source.slice(1).match(/.{2}/g).map((part) => Number.parseInt(part, 16));
      const targetColor = styles.getPropertyValue(`--${target}`).trim();
      const replacement = parseThemeColor(targetColor);
      return [rgb.join(','), [
        Math.round(replacement.r),
        Math.round(replacement.g),
        Math.round(replacement.b),
        replacement.a,
      ]];
    }));
    for (let index = 0; index < pixels.data.length; index += 4) {
      const key = `${pixels.data[index]},${pixels.data[index + 1]},${pixels.data[index + 2]}`;
      const replacement = replacements.get(key);
      if (!replacement) continue;
      pixels.data[index] = replacement[0];
      pixels.data[index + 1] = replacement[1];
      pixels.data[index + 2] = replacement[2];
      pixels.data[index + 3] = Math.round(pixels.data[index + 3] * replacement[3]);
    }
    context.putImageData(pixels, 0, 0);
    spriteSheet = canvas;
    draw();
    return;
  }
  const colors = getComputedStyle(document.documentElement);
  spriteSheet = createPlaceholderSpriteSheet(document, {
    body: colors.getPropertyValue('--buddy').trim(),
    ink: colors.getPropertyValue('--ink').trim(),
    accent: colors.getPropertyValue('--accent').trim(),
  });
  draw();
}

async function applyPackAssets(assets) {
  if (assets) {
    const [packDef, spriteBytes] = assets;
    const blob = new Blob([new Uint8Array(spriteBytes)], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('The installed buddy sprite could not be decoded.'));
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
    activePackDef = packDef;
    activeSpriteImage = img;
    refreshSpritePalette();
    personality = { ...defaultPersonality, ...packDef.personality };
    behavior = createBuddyBehavior(
      usesSharedBehaviorRules() ? ctx.buddyRules ?? DEFAULT_BUDDY_RULES : packDef.rules,
    );
  } else {
    activePackDef = null;
    activeSpriteImage = null;
    personality = { ...defaultPersonality };
    behavior = createBuddyBehavior(ctx.buddyRules ?? DEFAULT_BUDDY_RULES);
    refreshSpritePalette();
  }
  ctx.events.emit('buddy.motion.metadata', { motion: activePackDef?.buddy.motion ?? null });
  behavior.setChatLimitMs(1000 + (100 - personality.chattiness) * 100);
  for (const [key, value] of Object.entries(personality)) {
    const legacyInput = panel.querySelector(`#buddy${key[0].toUpperCase()}${key.slice(1)}`);
    const labInput = document.querySelector(`#lab${key[0].toUpperCase()}${key.slice(1)}`);
    if (legacyInput) legacyInput.value = String(value);
    if (labInput) labInput.value = String(value);
  }
  activeSpriteAnimationName = null;
  updateBuddyFps();
  draw();
}

function place() {
  document.querySelector('#buddyWrap').style.setProperty('--buddy-x', `${state.x}px`);
  document.querySelector('#buddyWrap').style.setProperty('--buddy-y', `${state.y}px`);
  document.querySelector('#buddy').style.transform = `scaleX(${state.dir})`;
  document.querySelector('#buddyWrap').hidden = state.mode === 'hidden';
  document.querySelector('#zzz').hidden = state.mode !== 'nap';
}

function say(text, durationMs = 3500) {
  const bubble = document.querySelector('#bubble');
  clearTimeout(dialogueTimer);
  bubble.hidden = !text;
  bubble.textContent = text || '';
  if (text && durationMs > 0) {
    dialogueTimer = setTimeout(() => {
      bubble.hidden = true;
      bubble.textContent = '';
    }, durationMs);
  }
}

function maxX() {
  return document.querySelector('#desk').clientWidth - 68;
}

function tick() {
  const lowMotion = calm || ctx.motion.getPolicy().ecoMode;
  const movementEnabled = ctx.animationEffects?.().buddyMovement !== false;
  state.frame += 1;
  if (ctx.isDeveloperMode?.()) developerFrameCount += 1;
  const wanderChance = wanderProbability(personality);
  if (movementEnabled && (state.mode === 'nap' || state.mode === 'idle') && !lowMotion && !focusActive
    && Math.random() < wanderChance) {
    const followsCursor = state.cursorX !== undefined && Math.random() < personality.clinginess / 100;
    state.target = followsCursor ? state.cursorX : Math.round(Math.random() * maxX());
    setBuddyMode('walk', 'idle-to-walk');
    if (!calm && supportsTransition('idle-to-walk')
      && (!activePackDef || activePackDef.buddy.animations.perk)) {
      setReactionAnimation('perk', transitionDuration('anticipation', 140));
    }
  }
  if (!lowMotion && state.mode === 'idle' && state.frame % 12 === 0) {
    setReactionAnimation('blink', 400);
  }
  if (state.mode === 'walk' || state.mode === 'break') {
    if (!movementEnabled) {
      setBuddyMode(state.mode === 'break' ? 'bubble' : 'idle', 'walk-to-idle');
      if (state.mode === 'bubble') startCountdown();
      draw();
      place();
      updateBuddyFps();
      return;
    }
    const difference = state.target - state.x;
    if (Math.abs(difference) <= 6) {
      state.x = state.target;
      if (state.mode === 'break') {
        setBuddyMode('bubble', 'walk-to-idle');
        startCountdown();
      } else {
        setBuddyMode(personality.sleepiness > 85 ? 'nap' : 'idle', 'walk-to-idle');
        animateBuddyImpact('settle');
      }
    } else {
      state.dir = difference > 0 ? 1 : -1;
      state.x += state.dir * Math.max(2, Math.round(2 + mood.energy / 25));
    }
  }
  draw();
  place();
  updateBuddyFps();
}

function buddyFps() {
  if (calm || ctx.motion.getPolicy().ecoMode || state.mode === 'nap'
    || ctx.animationEffects?.().buddyAnimation === false) return 2;
  const animation = activePackDef?.buddy.animations[requestedBuddyAnimation()];
  if (animation) return animation.fps;
  return state.mode === 'walk' || state.mode === 'break' ? 30 : 6;
}

function updateBuddyFps() {
  if (cancelBuddyAnimation) ctx.motion.setFps('desk-buddy', buddyFps());
}

function stopBuddyAnimation() {
  const cancel = cancelBuddyAnimation;
  cancelBuddyAnimation = null;
  lastBuddyTickAt = null;
  cancel?.();
}

function startBuddyAnimation() {
  if (cancelBuddyAnimation || ctx.motion.getPolicy().intensity === 'off') return;
  cancelBuddyAnimation = ctx.motion.register({
    id: 'desk-buddy',
    kind: 'buddy-idle',
    fps: buddyFps(),
    element: document.querySelector('#buddyWrap'),
    update({ frameTime }) {
      const interval = calm || ctx.motion.getPolicy().ecoMode || state.mode === 'nap' ? 500 : 300;
      if (lastBuddyTickAt === null || frameTime - lastBuddyTickAt >= interval) {
        lastBuddyTickAt = frameTime;
        tick();
      } else if (activePackDef) {
        draw();
      }
      return true;
    },
    onStop() {
      cancelBuddyAnimation = null;
      lastBuddyTickAt = null;
    },
  });
}

function runBehaviorAction(action) {
  if (Object.hasOwn(action, 'setState')) {
    const mode = ({
      idle: 'idle',
      walking: 'walk',
      sitting: 'sit',
      sleeping: 'nap',
      carried: 'carried',
      falling: 'falling',
    })[action.setState];
    if (!mode) return;
    if (action.setState === 'reacting') {
      setReactionAnimation('perk', 1200);
      return;
    }
    if (buddyStateMachine?.state === 'hidden' && mode !== 'idle') setBuddyMode('idle');
    setBuddyMode(mode);
  } else if (Object.hasOwn(action, 'play')) {
    setReactionAnimation(action.play, 1400);
  } else if (Object.hasOwn(action, 'say')) {
    const lines = activePackDef?.lines?.[action.say];
    const text = lines ? lines[Math.floor(Math.random() * lines.length)] : action.say;
    say(text);
  } else if (Object.hasOwn(action, 'adjust')) {
    for (const [key, amount] of Object.entries(action.adjust)) {
      if (Object.hasOwn(mood, key) && Number.isFinite(amount)) {
        mood[key] = Math.max(0, Math.min(100, mood[key] + amount));
      }
    }
  } else if (Object.hasOwn(action, 'toast')) {
    ctx.toast(action.toast);
  }
}

function handleBehaviorEvent(name, payload = {}) {
  const sensorByEvent = {
    'clipboard.copied': 'clipboard',
    'file.renamed': 'files',
    'break.taken': 'breaks',
  };
  if (sensorByEvent[name] && ctx.buddySensors?.[sensorByEvent[name]] === false) {
    if (ctx.isDeveloperMode?.()) {
      ctx.events.emit('buddy.developer.rule-trace', {
        eventName: name,
        selectedRuleId: null,
        outcomes: [{
          id: 'sensor-gate',
          name: 'Buddy sensor permission',
          result: 'skipped',
          reason: `${sensorByEvent[name]} sensor is disabled`,
        }],
      });
    }
    return;
  }
  const result = behavior.evaluate(name, {
    event: payload,
    mood,
    personality,
    state: state.mode,
    time: {
      hour: developerClockHour ?? new Date().getHours(),
      weekday: new Date().getDay(),
    },
  });
  result?.actions.forEach(runBehaviorAction);
}

function startCountdown() {
  let secondsLeft = 20;
  say(`Look 20 feet away. ${secondsLeft}s`);
  countdownTimer = setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft <= 0) endBreak('Nice. Back to work.');
    else say(`Look 20 feet away. ${secondsLeft}s`);
  }, 1000);
}

function startBreak() {
  if (state.mode === 'break' || state.mode === 'bubble') return;
  ctx.events.emit('break.due', {});
  clearInterval(countdownTimer);
  panel.querySelector('#breakNote').textContent = 'Your buddy is walking out to remind you.';
  if (calm) {
    setBuddyMode('bubble');
    say('Time for a break!');
    startCountdown();
    return;
  }
  setBuddyMode('break', 'idle-to-walk');
  state.target = Math.round(maxX() / 2);
  updateBuddyFps();
  say('Time for a break!');
}

function endBreak(message, taken = true) {
  clearInterval(countdownTimer);
  say('');
  state.target = 16;
  setBuddyMode(calm ? 'nap' : 'walk', calm ? 'walk-to-idle' : 'idle-to-walk');
  updateBuddyFps();
  panel.querySelector('#breakNote').textContent = 'Your buddy is napping on the desk.';
  if (message) ctx.toast(message);
  if (taken) ctx.events.emit('break.taken', {});
}

export function mount(element) {
  panel = element;
  panel.hidden = true;
}

export function unmount(element) {
  element.hidden = true;
}

export async function start(context) {
  ctx = context;
  mood = { energy: 60, mood: 60, curiosity: 60 };
  defaultPersonality = { energy: 60, curiosity: 60, chattiness: 40, clinginess: 20, sleepiness: 70 };
  personality = { ...defaultPersonality };
  behavior = createBuddyBehavior(ctx.buddyRules ?? DEFAULT_BUDDY_RULES);
  state = { x: 16, y: 0, dir: 1, mode: 'idle', target: 16, frame: 0 };
  document.querySelector('#buddyWrap').hidden = false;
  buddyStateMachine = createBuddyStateMachine('idle', (transition) => {
    ctx.events.emit('buddy.state.changed', transition);
  });
  await applyPackAssets(ctx.enabledPackAssets);
  document.addEventListener('desk-drawer-theme-changed', refreshSpritePalette);
  cleanup.push(() => document.removeEventListener('desk-drawer-theme-changed', refreshSpritePalette));
  mediaQuery = matchMedia('(prefers-reduced-motion: reduce)');
  calm = mediaQuery.matches
    || ctx.animationsEnabled?.() === false
    || ctx.motion.getPolicy().intensity === 'off';
  const onMotionChange = (event) => {
    calm = event.matches
      || ctx.animationsEnabled?.() === false
      || ctx.motion.getPolicy().intensity === 'off';
  };
  mediaQuery.addEventListener('change', onMotionChange);
  cleanup.push(() => mediaQuery.removeEventListener('change', onMotionChange));
  cleanup.push(ctx.events.on('buddy.animations.changed', ({ enabled }) => {
    calm = mediaQuery.matches || !enabled;
    if (enabled) startBuddyAnimation();
    else stopBuddyAnimation();
    draw();
    updateBuddyFps();
  }));
  cleanup.push(ctx.events.on('buddy.animation.settings.changed', ({ enabled, settings }) => {
    calm = mediaQuery.matches || !enabled;
    if (!settings?.effects?.buddyImpacts) cancelBuddyImpact?.();
    if (!settings?.effects?.buddyTransitions) {
      document.querySelector('#buddyPrevious').classList.remove('blend');
    }
    if (settings?.effects?.buddyMovement === false && ['walk', 'break'].includes(state.mode)) {
      setBuddyMode(state.mode === 'break' ? 'bubble' : 'idle', 'walk-to-idle');
      if (state.mode === 'bubble') startCountdown();
    }
    if (enabled) startBuddyAnimation();
    else stopBuddyAnimation();
    draw();
    updateBuddyFps();
  }));
  cleanup.push(ctx.events.on('buddy.developer.snapshot.request', emitDeveloperSnapshot));
  cleanup.push(ctx.events.on('buddy.developer.force-state', ({ state: mode }) => {
    if (!ctx.isDeveloperMode?.() || ![
      'idle', 'sitting', 'walking', 'sleeping', 'reacting', 'carried', 'falling',
    ].includes(mode)) return;
    const modeMap = {
      idle: 'idle',
      sitting: 'sit',
      walking: 'walk',
      sleeping: 'nap',
      reacting: 'bubble',
      carried: 'carried',
      falling: 'falling',
    };
    setBuddyMode(modeMap[mode], mode === 'walking' ? 'idle-to-walk' : 'walk-to-idle');
    setReactionAnimation(null, 0);
    updateBuddyFps();
    draw();
    place();
    emitDeveloperSnapshot();
  }));
  cleanup.push(ctx.events.on('buddy.developer.clock', ({ hour }) => {
    if (!ctx.isDeveloperMode?.()) return;
    developerClockHour = Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
  }));
  cleanup.push(ctx.events.on('buddy.developer.mode', ({ enabled }) => {
    clearInterval(developerSnapshotTimer);
    developerSnapshotTimer = undefined;
    developerFrameCount = 0;
    if (enabled) developerSnapshotTimer = setInterval(emitDeveloperSnapshot, 1000);
  }));
  const desk = document.querySelector('#desk');
  const buddy = document.querySelector('#buddyWrap');
  const onBuddyPointerDown = (event) => {
    if (event.button !== 0 || !event.target.closest('#buddy')) return;
    buddyDrag = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      startX: state.x,
      startY: state.y,
      moved: false,
    };
    buddy.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const onBuddyPointerMove = (event) => {
    if (!buddyDrag || buddyDrag.pointerId !== event.pointerId) return;
    const dx = event.clientX - buddyDrag.originX;
    const dy = event.clientY - buddyDrag.originY;
    if (!buddyDrag.moved && Math.hypot(dx, dy) < 6) return;
    if (!buddyDrag.moved) {
      buddyDrag.moved = true;
      setBuddyMode('carried', 'pickup');
      animateBuddyImpact('pickup');
    }
    state.x = Math.max(0, Math.min(maxX(), buddyDrag.startX + dx));
    state.y = Math.max(-64, Math.min(64, buddyDrag.startY + dy));
    place();
  };
  const onBuddyPointerUp = (event) => {
    if (!buddyDrag || buddyDrag.pointerId !== event.pointerId) return;
    const wasDragged = buddyDrag.moved;
    buddyDrag = null;
    if (wasDragged) {
      setBuddyMode('falling', 'drop');
      animateBuddyImpact('drop');
      ctx.emitParticles('dust', event.clientX, event.clientY);
      clearTimeout(fallTimer);
      fallTimer = setTimeout(() => {
        if (state.mode !== 'falling') return;
        setBuddyMode('idle', 'settle');
        animateBuddyImpact('settle');
        draw();
        place();
      }, transitionDuration('settle', 220));
    } else {
      const animation = !activePackDef || activePackDef.buddy.animations.happy
        ? 'happy'
        : 'perk';
      setReactionAnimation(animation, transitionDuration('impact', 220));
      animateBuddyImpact('pet');
      ctx.emitParticles('heart', event.clientX, event.clientY);
      draw();
    }
    updateBuddyFps();
    place();
  };
  const onBuddyPointerCancel = () => {
    if (!buddyDrag) return;
    buddyDrag = null;
    setBuddyMode('idle', 'drop');
    draw();
    place();
  };
  buddy.addEventListener('pointerdown', onBuddyPointerDown);
  buddy.addEventListener('pointermove', onBuddyPointerMove);
  buddy.addEventListener('pointerup', onBuddyPointerUp);
  buddy.addEventListener('pointercancel', onBuddyPointerCancel);
  cleanup.push(() => {
    buddy.removeEventListener('pointerdown', onBuddyPointerDown);
    buddy.removeEventListener('pointermove', onBuddyPointerMove);
    buddy.removeEventListener('pointerup', onBuddyPointerUp);
    buddy.removeEventListener('pointercancel', onBuddyPointerCancel);
  });
  const onPointerMove = (event) => {
    if (ctx.buddySensors?.cursor === false) return;
    const bounds = desk.getBoundingClientRect();
    state.cursorX = Math.max(0, Math.min(maxX(), event.clientX - bounds.left - 32));
  };
  desk.addEventListener('pointermove', onPointerMove);
  cleanup.push(() => desk.removeEventListener('pointermove', onPointerMove));
  reminderTimer = setInterval(startBreak, 20 * 60 * 1000);
  moodTimer = setInterval(() => {
    mood = driftMood(mood, { sleeping: state.mode === 'nap' });
    emitDeveloperSnapshot();
  }, 60_000);
  for (const name of ['clipboard.copied', 'file.renamed', 'break.taken']) {
    cleanup.push(ctx.events.on(name, (payload) => handleBehaviorEvent(name, payload)));
  }
  cleanup.push(ctx.events.on('break.requested', () => startBreak()));
  cleanup.push(ctx.events.on('tool.used', ({ id, action }) => {
    const lines = {
      'color-picker': 'That color looks nice!',
      'keep-awake': 'I’ll stay right here.',
      'pin-window': 'Front row seat!',
      notes: 'I’ll keep quiet while you jot that down.',
      focus: action === 'completed' ? 'Nice focus session!' : 'I’ll nap while you focus.',
      'tidy-downloads': 'The desk looks tidier!',
      scenes: 'Ready for the next scene!',
    };
    if (!lines[id]) return;
    setReactionAnimation(action === 'completed' ? 'happy' : 'perk', 1400);
    mood.mood = Math.min(100, mood.mood + 2);
    say(lines[id], 2400);
    draw();
    ctx.hop();
  }));
  cleanup.push(ctx.events.on('focus.started', () => {
    focusActive = true;
    setBuddyMode('nap', 'walk-to-idle');
    updateBuddyFps();
    draw();
    place();
  }));
  cleanup.push(ctx.events.on('focus.finished', () => {
    focusActive = false;
    if (state.mode === 'nap') setBuddyMode('idle', 'walk-to-idle');
    updateBuddyFps();
    draw();
    place();
  }));
  cleanup.push(ctx.events.on('buddy.rules.changed', ({ rules }) => {
    if (!activePackDef || usesSharedBehaviorRules()) behavior = createBuddyBehavior(rules);
  }));
  cleanup.push(ctx.events.on('buddy.pack.changed', ({ assets }) => {
    applyPackAssets(assets).catch((error) => {
      ctx.toast(`Could not apply the installed buddy pack: ${error}`);
    });
  }));
  cleanup.push(ctx.events.on('buddy.sensor.changed', ({ id, enabled }) => {
    if (id === 'cursor' && !enabled) state.cursorX = undefined;
  }));
  cleanup.push(ctx.events.on('buddy.personality.changed', ({ key, value }) => {
    if (!Object.hasOwn(personality, key) || !Number.isFinite(value)) return;
    personality[key] = Math.max(0, Math.min(100, value));
    const legacyInput = panel.querySelector(`#buddy${key[0].toUpperCase()}${key.slice(1)}`);
    const labInput = document.querySelector(`#lab${key[0].toUpperCase()}${key.slice(1)}`);
    if (legacyInput) legacyInput.value = String(personality[key]);
    if (labInput) labInput.value = String(personality[key]);
    behavior.setChatLimitMs(1000 + (100 - personality.chattiness) * 100);
  }));
  for (const [key, id] of Object.entries({
    energy: 'buddyEnergy',
    curiosity: 'buddyCuriosity',
    chattiness: 'buddyChattiness',
    clinginess: 'buddyClinginess',
    sleepiness: 'buddySleepiness',
  })) {
    const input = panel.querySelector(`#${id}`);
    const update = () => {
      personality[key] = Number(input.value);
      behavior.setChatLimitMs(1000 + (100 - personality.chattiness) * 100);
    };
    input.addEventListener('input', update);
    cleanup.push(() => input.removeEventListener('input', update));
    update();
  }
  panel.querySelector('#breakBtn').onclick = startBreak;
  panel.querySelector('#breakStop').onclick = () => endBreak('Break dismissed', false);
  draw();
  place();
  startBuddyAnimation();
}

export function stop() {
  if (state && buddyStateMachine && state.mode !== 'hidden') setBuddyMode('hidden');
  stopBuddyAnimation();
  clearInterval(reminderTimer);
  clearInterval(countdownTimer);
  clearTimeout(dialogueTimer);
  clearTimeout(reactionTimer);
  clearTimeout(fallTimer);
  clearInterval(moodTimer);
  cleanup.forEach((dispose) => dispose());
  cleanup = [];
  spriteSheet = null;
  behavior = null;
  mood = null;
  personality = null;
  defaultPersonality = null;
  focusActive = false;
  buddyDrag = null;
  buddyStateMachine = null;
  cancelBuddyImpact?.();
  developerClockHour = null;
  clearInterval(developerSnapshotTimer);
  developerSnapshotTimer = undefined;
  panel.querySelector('#breakBtn').onclick = null;
  panel.querySelector('#breakStop').onclick = null;
  say('');
}

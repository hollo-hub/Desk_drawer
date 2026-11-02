import { BUDDY_ANIMATIONS, validateBehaviorRules } from './behavior-engine.js';
import { DEFAULT_BUDDY_RULES } from './default-rules.js';

const ROOT_KEYS = ['schemaVersion', 'id', 'name', 'author', 'version', 'license', 'buddy', 'personality', 'lines', 'rules'];
const BUDDY_KEYS = ['sprite', 'frame', 'anchor', 'animations', 'motion', 'paletteMap'];
const ANIMATION_KEYS = ['frames', 'fps', 'loop'];
const MOTION_KEYS = ['timings', 'supportedTransitions'];
const MOTION_TIMING_KEYS = ['anticipationMs', 'settleMs', 'impactMs', 'unlockMs'];
const SUPPORTED_TRANSITIONS = [
  'idle-to-walk', 'walk-to-idle', 'pickup', 'drop', 'pet', 'settle', 'sticker-drop', 'unlock',
];
const PERSONALITY_KEYS = ['energy', 'curiosity', 'chattiness', 'clinginess', 'sleepiness'];
const MAX_PACK_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 4096;

function rejectUnknownKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new TypeError(`${path}.${key}: unknown field.`);
  }
}

function requireObject(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path}: expected an object.`);
  }
}

function requireText(value, path, limit) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) {
    throw new TypeError(`${path}: expected 1-${limit} characters.`);
  }
}

export function validateDeskPack(input) {
  if (typeof input === 'string' && new TextEncoder().encode(input).byteLength > MAX_PACK_BYTES) {
    throw new TypeError('pack.json: pack exceeds the 20 MB size limit.');
  }
  let pack = input;
  if (typeof input === 'string') {
    try {
      pack = JSON.parse(input);
    } catch (error) {
      throw new TypeError(`pack.json: invalid JSON (${error.message}).`);
    }
  }
  requireObject(pack, 'pack');
  rejectUnknownKeys(pack, ROOT_KEYS, 'pack');
  if (pack.schemaVersion !== 1) throw new TypeError('pack.schemaVersion: expected version 1.');
  if (typeof pack.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(pack.id)) {
    throw new TypeError('pack.id: use 1-64 lowercase letters, numbers, or hyphens.');
  }
  for (const key of ['name', 'author', 'version', 'license']) requireText(pack[key], `pack.${key}`, 120);
  requireObject(pack.buddy, 'pack.buddy');
  rejectUnknownKeys(pack.buddy, BUDDY_KEYS, 'pack.buddy');
  if (typeof pack.buddy.sprite !== 'string'
    || !/^sprites\/[a-zA-Z0-9_-]+\.png$/i.test(pack.buddy.sprite)) {
    throw new TypeError('pack.buddy.sprite: expected a PNG path inside sprites/ with no traversal.');
  }
  if (pack.buddy.paletteMap !== undefined) {
    requireObject(pack.buddy.paletteMap, 'pack.buddy.paletteMap');
    if (Object.keys(pack.buddy.paletteMap).length > 16) {
      throw new TypeError('pack.buddy.paletteMap: at most 16 source colors are supported.');
    }
    for (const [sourceColor, target] of Object.entries(pack.buddy.paletteMap)) {
      if (!/^#[\da-f]{6}$/i.test(sourceColor) || !['buddy', 'ink', 'accent'].includes(target)) {
        throw new TypeError('pack.buddy.paletteMap: map six-digit hex colors to buddy, ink, or accent.');
      }
    }
  }
  requireObject(pack.buddy.frame, 'pack.buddy.frame');
  rejectUnknownKeys(pack.buddy.frame, ['w', 'h'], 'pack.buddy.frame');
  const { w, h } = pack.buddy.frame;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w !== 32 || h !== 32) {
    throw new TypeError('pack.buddy.frame: placeholder-compatible frames must be exactly 32×32.');
  }
  requireObject(pack.buddy.anchor, 'pack.buddy.anchor');
  rejectUnknownKeys(pack.buddy.anchor, ['x', 'y'], 'pack.buddy.anchor');
  for (const key of ['x', 'y']) {
    if (!Number.isInteger(pack.buddy.anchor[key]) || pack.buddy.anchor[key] < 0 || pack.buddy.anchor[key] >= 32) {
      throw new TypeError(`pack.buddy.anchor.${key}: expected an integer from 0 to 31.`);
    }
  }
  requireObject(pack.buddy.animations, 'pack.buddy.animations');
  rejectUnknownKeys(pack.buddy.animations, BUDDY_ANIMATIONS, 'pack.buddy.animations');
  const animations = pack.buddy.animations;
  for (const required of ['idle', 'walk', 'sleep']) {
    if (!Object.hasOwn(animations, required)) throw new TypeError(`pack.buddy.animations.${required}: required animation is missing.`);
  }
  for (const [name, animation] of Object.entries(animations)) {
    const path = `pack.buddy.animations.${name}`;
    requireObject(animation, path);
    rejectUnknownKeys(animation, ANIMATION_KEYS, path);
    if (!Array.isArray(animation.frames) || !animation.frames.length || animation.frames.length > 256
      || animation.frames.some((frame) => !Number.isInteger(frame) || frame < 0)) {
      throw new TypeError(`${path}.frames: expected 1-256 non-negative integer frame indices.`);
    }
    if (!Number.isFinite(animation.fps) || animation.fps < 0.1 || animation.fps > 30
      || typeof animation.loop !== 'boolean') {
      throw new TypeError(`${path}: fps must be 0.1-30 and loop must be boolean.`);
    }
  }
  if (pack.buddy.motion !== undefined) {
    requireObject(pack.buddy.motion, 'pack.buddy.motion');
    rejectUnknownKeys(pack.buddy.motion, MOTION_KEYS, 'pack.buddy.motion');
    if (pack.buddy.motion.timings !== undefined) {
      requireObject(pack.buddy.motion.timings, 'pack.buddy.motion.timings');
      rejectUnknownKeys(pack.buddy.motion.timings, MOTION_TIMING_KEYS, 'pack.buddy.motion.timings');
      for (const [key, milliseconds] of Object.entries(pack.buddy.motion.timings)) {
        if (!Number.isInteger(milliseconds) || milliseconds < 0 || milliseconds > 400) {
          throw new TypeError(`pack.buddy.motion.timings.${key}: expected an integer from 0 to 400 ms.`);
        }
      }
    }
    if (pack.buddy.motion.supportedTransitions !== undefined) {
      const transitions = pack.buddy.motion.supportedTransitions;
      if (!Array.isArray(transitions) || transitions.length > SUPPORTED_TRANSITIONS.length
        || new Set(transitions).size !== transitions.length
        || transitions.some((transition) => !SUPPORTED_TRANSITIONS.includes(transition))) {
        throw new TypeError('pack.buddy.motion.supportedTransitions: contains an unknown or duplicate transition.');
      }
    }
  }
  requireObject(pack.personality, 'pack.personality');
  rejectUnknownKeys(pack.personality, PERSONALITY_KEYS, 'pack.personality');
  for (const key of PERSONALITY_KEYS) {
    if (!Number.isInteger(pack.personality[key]) || pack.personality[key] < 0 || pack.personality[key] > 100) {
      throw new TypeError(`pack.personality.${key}: expected an integer from 0 to 100.`);
    }
  }
  requireObject(pack.lines, 'pack.lines');
  for (const [group, lines] of Object.entries(pack.lines)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(group) || !Array.isArray(lines)
      || lines.length > 100 || lines.some((line) => typeof line !== 'string' || !line.trim() || line.length > 200)) {
      throw new TypeError(`pack.lines.${group}: expected at most 100 non-empty lines of 200 characters or fewer.`);
    }
  }
  try {
    validateBehaviorRules(pack.rules);
  } catch (error) {
    throw new TypeError(`pack.rules: ${error.message}`);
  }
  for (const [index, rule] of pack.rules.entries()) {
    for (const action of rule.then) {
      if (Object.hasOwn(action, 'play') && !Object.hasOwn(animations, action.play)) {
        throw new TypeError(`pack.rules[${index}].then: animation "${action.play}" is not declared.`);
      }
      if (Object.hasOwn(action, 'say') && !Object.hasOwn(pack.lines, action.say)) {
        throw new TypeError(`pack.rules[${index}].then: dialogue group "${action.say}" is not declared.`);
      }
    }
  }
  return structuredClone(pack);
}

export function validateInstalledDeskPackAssets(assets) {
  if (!Array.isArray(assets) || assets.length !== 2 || !Array.isArray(assets[1])
    || assets[1].length === 0 || assets[1].length > MAX_IMAGE_BYTES
    || assets[1].some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    throw new TypeError('Installed pack assets have an invalid shape or sprite size.');
  }
  return [validateDeskPack(assets[0]), assets[1]];
}

export function validatePackImageMetadata(path, byteLength, width, height, highestFrame) {
  if (typeof path !== 'string' || !/^sprites\/[a-zA-Z0-9_-]+\.png$/i.test(path)) {
    throw new TypeError('sprite path: expected a PNG inside sprites/ with no traversal.');
  }
  if (!Number.isInteger(byteLength) || byteLength < 1 || byteLength > MAX_IMAGE_BYTES) {
    throw new TypeError('sprite image: file must be between 1 byte and 4 MB.');
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width > MAX_IMAGE_DIMENSION
    || height > MAX_IMAGE_DIMENSION || width < 32 || height < 32
    || width % 32 || height % 32 || (width / 32) * (height / 32) <= highestFrame) {
    throw new TypeError('sprite image: dimensions must be at most 4096 px, divisible into 32×32 frames, and contain every referenced frame.');
  }
  return true;
}

export function createDefaultDeskPack(basePack) {
  const pack = structuredClone(basePack);
  const lines = {};
  pack.rules = structuredClone(DEFAULT_BUDDY_RULES).map((rule) => ({
    ...rule,
    then: rule.then.map((action, index) => {
      if (!Object.hasOwn(action, 'say')) return action;
      const group = `default-${rule.id}-${index}`;
      lines[group] = [action.say];
      return { say: group };
    }),
  }));
  pack.lines = { ...pack.lines, ...lines };
  return pack;
}

export const DESK_PACK_LIMITS = Object.freeze({
  packBytes: MAX_PACK_BYTES,
  imageBytes: MAX_IMAGE_BYTES,
  imageDimension: MAX_IMAGE_DIMENSION,
  rules: 200,
  linesPerGroup: 100,
});

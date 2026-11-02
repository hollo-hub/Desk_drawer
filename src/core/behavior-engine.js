import { BUDDY_ACTION_STATES } from './buddy-state.js';

const OPERATORS = new Set(['==', '!=', '>', '<', '>=', '<=', 'between']);
export const BUDDY_ANIMATIONS = Object.freeze([
  'idle', 'blink', 'walk', 'sit', 'sleep', 'yawn', 'perk', 'happy', 'curious',
  'eat', 'carried', 'fall', 'jump_up', 'jump_down', 'land', 'lie_down', 'loaf',
  'get_up', 'groom', 'stretch', 'tail_flick', 'ear_twitch', 'sit_edge', 'turn',
  'look_up', 'look_down', 'sleep_loaf',
]);
const ANIMATIONS = new Set(BUDDY_ANIMATIONS);
const MOOD_VARIABLES = new Set(['energy', 'mood', 'curiosity']);
const NUMERIC_VARIABLES = new Set([
  'event.count',
  'mood.energy', 'mood.mood', 'mood.curiosity',
  'personality.energy', 'personality.curiosity', 'personality.chattiness',
  'personality.clinginess', 'personality.sleepiness',
  'time.hour', 'time.weekday', 'idle.seconds', 'random',
]);
const VALUE_VARIABLES = new Set(['event.kind', 'state']);

function validateCondition(condition, ruleId) {
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)
    || Object.keys(condition).some((key) => !['var', 'op', 'value'].includes(key))
    || typeof condition.var !== 'string' || !condition.var.trim() || condition.var.length > 120
    || !OPERATORS.has(condition.op) || !Object.hasOwn(condition, 'value')) {
    throw new TypeError(`Rule "${ruleId}" has an invalid condition.`);
  }
  const numeric = NUMERIC_VARIABLES.has(condition.var);
  const boolean = /^module\.[a-z0-9_-]+\.enabled$/.test(condition.var);
  if (!numeric && !boolean && !VALUE_VARIABLES.has(condition.var)) {
    throw new TypeError(`Rule "${ruleId}" uses an unknown condition variable.`);
  }
  if (condition.op === 'between') {
    if (!numeric || !Array.isArray(condition.value) || condition.value.length !== 2
      || condition.value.some((value) => !Number.isFinite(value))) {
      throw new TypeError(`Rule "${ruleId}" has an invalid between condition.`);
    }
    return;
  }
  const value = condition.value;
  if ((numeric && !Number.isFinite(value))
    || (boolean && typeof value !== 'boolean')
    || (VALUE_VARIABLES.has(condition.var) && (typeof value !== 'string' || value.length > 200))
    || (['>', '<', '>=', '<='].includes(condition.op) && !numeric)) {
    throw new TypeError(`Rule "${ruleId}" has an invalid condition value.`);
  }
}

function readVariable(source, path) {
  return path.split('.').reduce((value, key) => value?.[key], source);
}

function conditionPasses(condition, environment, random) {
  const actual = condition.var === 'random'
    ? random()
    : readVariable(environment, condition.var);
  const expected = condition.value;
  switch (condition.op) {
    case '==': return actual === expected;
    case '!=': return actual !== expected;
    case '>': return actual > expected;
    case '<': return actual < expected;
    case '>=': return actual >= expected;
    case '<=': return actual <= expected;
    case 'between': return Array.isArray(expected) && expected.length === 2
      && actual >= expected[0] && actual <= expected[1];
    default: return false;
  }
}

export function validateBehaviorRules(rules) {
  if (!Array.isArray(rules) || rules.length > 200) {
    throw new TypeError('Behavior rules must be an array with at most 200 entries.');
  }
  const ids = new Set();
  for (const [index, rule] of rules.entries()) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
      throw new TypeError(`Rule ${index + 1} must be an object.`);
    }
    if (typeof rule.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(rule.id) || ids.has(rule.id)) {
      throw new TypeError(`Rule ${index + 1} needs a unique valid id.`);
    }
    ids.add(rule.id);
    if (typeof rule.name !== 'string' || !rule.name.trim() || rule.name.length > 120) {
      throw new TypeError(`Rule "${rule.id}" needs a name of 1 to 120 characters.`);
    }
    if (typeof rule.enabled !== 'boolean' || typeof rule.when !== 'string' || !rule.when.includes('.')) {
      throw new TypeError(`Rule "${rule.id}" needs enabled and a namespaced event in when.`);
    }
    if (!Array.isArray(rule.if) || rule.if.length > 20 || !Array.isArray(rule.then) || !rule.then.length || rule.then.length > 20) {
      throw new TypeError(`Rule "${rule.id}" needs at most 20 conditions and 1 to 20 actions.`);
    }
    for (const condition of rule.if) validateCondition(condition, rule.id);
    if (!Number.isInteger(rule.cooldownSec) || rule.cooldownSec < 0 || rule.cooldownSec > 86400
      || !Number.isFinite(rule.priority) || !Number.isFinite(rule.weight) || rule.weight <= 0) {
      throw new TypeError(`Rule "${rule.id}" has invalid cooldown, priority, or weight.`);
    }
    for (const action of rule.then) {
      const keys = action && typeof action === 'object' ? Object.keys(action) : [];
      if (keys.length !== 1 || !['play', 'say', 'adjust', 'toast', 'setState'].includes(keys[0])) {
        throw new TypeError(`Rule "${rule.id}" contains an unsupported action.`);
      }
      if (Object.hasOwn(action, 'play') && !ANIMATIONS.has(action.play)) {
        throw new TypeError(`Rule "${rule.id}" uses an unknown animation.`);
      }
      if (Object.hasOwn(action, 'say')
        && (typeof action.say !== 'string' || !action.say.trim() || action.say.length > 200)) {
        throw new TypeError(`Rule "${rule.id}" has an invalid dialogue line.`);
      }
      if (Object.hasOwn(action, 'toast')
        && (typeof action.toast !== 'string' || !action.toast.trim() || action.toast.length > 200)) {
        throw new TypeError(`Rule "${rule.id}" has an invalid toast message.`);
      }
      if (Object.hasOwn(action, 'setState') && !BUDDY_ACTION_STATES.includes(action.setState)) {
        throw new TypeError(`Rule "${rule.id}" uses an unknown buddy state.`);
      }
      if (Object.hasOwn(action, 'adjust')
        && (!action.adjust || typeof action.adjust !== 'object' || Array.isArray(action.adjust)
          || Object.entries(action.adjust).some(([key, value]) =>
            !MOOD_VARIABLES.has(key) || !Number.isFinite(value) || Math.abs(value) > 100))) {
        throw new TypeError(`Rule "${rule.id}" has an invalid mood adjustment.`);
      }
    }
  }
  return rules;
}

export function createBehaviorEngine(
  rules,
  { now = Date.now, random = Math.random, chatLimitMs = 5000, onTrace = () => {} } = {},
) {
  validateBehaviorRules(rules);
  const cooldowns = new Map();
  let lastSpokenAt = -Infinity;
  let currentChatLimitMs = chatLimitMs;

  return {
    setChatLimitMs(value) {
      if (!Number.isFinite(value) || value < 0) throw new TypeError('Chat limit must be a non-negative number.');
      currentChatLimitMs = value;
    },
    evaluate(eventName, environment) {
      const time = now();
      const outcomes = [];
      const eligible = [];
      for (const rule of rules) {
        if (!rule.enabled) {
          outcomes.push({ id: rule.id, name: rule.name, result: 'skipped', reason: 'disabled' });
          continue;
        }
        if (rule.when !== eventName) {
          outcomes.push({ id: rule.id, name: rule.name, result: 'skipped', reason: 'different event' });
          continue;
        }
        if (time - (cooldowns.get(rule.id) ?? -Infinity) < rule.cooldownSec * 1000) {
          outcomes.push({ id: rule.id, name: rule.name, result: 'skipped', reason: 'cooldown active' });
          continue;
        }
        let failedCondition = -1;
        for (const [index, condition] of rule.if.entries()) {
          if (!conditionPasses(condition, environment, random)) {
            failedCondition = index;
            break;
          }
        }
        if (failedCondition >= 0) {
          outcomes.push({
            id: rule.id,
            name: rule.name,
            result: 'skipped',
            reason: `condition ${failedCondition + 1} did not match`,
          });
          continue;
        }
        outcomes.push({ id: rule.id, name: rule.name, result: 'eligible', reason: 'conditions matched' });
        eligible.push(rule);
      }
      if (!eligible.length) {
        onTrace({ eventName, selectedRuleId: null, outcomes });
        return null;
      }
      const priority = Math.max(...eligible.map((rule) => rule.priority));
      const candidates = eligible.filter((rule) => rule.priority === priority);
      const totalWeight = candidates.reduce((sum, rule) => sum + rule.weight, 0);
      let choice = random() * totalWeight;
      const selected = candidates.find((rule) => (choice -= rule.weight) < 0) ?? candidates[candidates.length - 1];
      cooldowns.set(selected.id, time);
      for (const outcome of outcomes) {
        if (outcome.id === selected.id) {
          outcome.result = 'matched';
          outcome.reason = 'selected by priority and weight';
        } else if (outcome.result === 'eligible') {
          outcome.result = 'skipped';
          outcome.reason = 'another eligible rule was selected';
        }
      }
      onTrace({
        eventName,
        selectedRuleId: selected.id,
        outcomes,
      });

      const actions = selected.then.filter((action) => {
        if (!Object.hasOwn(action, 'say')) return true;
        if (time - lastSpokenAt < currentChatLimitMs) return false;
        lastSpokenAt = time;
        return true;
      });
      return { rule: selected, actions };
    },
  };
}

export function driftMood(mood, { minutes = 1, sleeping = false, hour = new Date().getHours() } = {}) {
  const next = { ...mood };
  next.energy = Math.max(0, Math.min(100, next.energy + (sleeping ? 1 : -0.1) * minutes));
  const curiosityShift = hour >= 22 || hour < 6 ? -0.1 : 0.02;
  next.curiosity = Math.max(0, Math.min(100, next.curiosity + curiosityShift * minutes));
  next.mood = Math.max(0, Math.min(100, next.mood + (sleeping ? 0.02 : -0.01) * minutes));
  return next;
}

export function wanderProbability({ energy, sleepiness }) {
  if (!Number.isFinite(energy) || !Number.isFinite(sleepiness)) {
    throw new TypeError('Buddy energy and sleepiness must be finite numbers.');
  }
  const activity = Math.max(0, Math.min(100, energy));
  const rest = Math.max(0, Math.min(100, sleepiness));
  return 0.01 + (activity * (100 - rest)) / 200_000;
}

export const BUDDY_STATES = Object.freeze([
  'idle',
  'walking',
  'sitting',
  'sleeping',
  'reacting',
  'carried',
  'falling',
  'hidden',
]);
export const BUDDY_ACTION_STATES = Object.freeze(BUDDY_STATES.filter((state) => state !== 'hidden'));

const STATE_SET = new Set(BUDDY_STATES);
const TRANSITIONS = new Map(BUDDY_STATES.map((state) => [
  state,
  new Set(state === 'hidden' ? ['idle'] : BUDDY_STATES.filter((next) => next !== state)),
]));

export function createBuddyStateMachine(initialState = 'idle', onTransition = () => {}) {
  if (!STATE_SET.has(initialState)) throw new TypeError(`Unknown buddy state: ${initialState}`);
  if (typeof onTransition !== 'function') throw new TypeError('State transition callback must be callable.');
  let current = initialState;

  return Object.freeze({
    get state() {
      return current;
    },
    transition(next) {
      if (!STATE_SET.has(next)) throw new TypeError(`Unknown buddy state: ${next}`);
      if (next === current) return false;
      if (!TRANSITIONS.get(current).has(next)) {
        throw new Error(`Buddy state transition ${current} -> ${next} is not allowed.`);
      }
      const previous = current;
      current = next;
      onTransition(Object.freeze({ previous, state: current }));
      return true;
    },
  });
}

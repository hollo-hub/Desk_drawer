export const BUDDY_STATES = Object.freeze([
  "idle",
  "blink",
  "focus",
  "done",
  "nudge",
  "paused",
]);

export function normalizeBuddyPack(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("Buddy packs must be objects.");
  }
  const definition = source.buddy ?? source.ghost;
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    throw new Error(`Buddy pack "${source.id ?? "unknown"}" has no buddy definition.`);
  }
  const { buddy, ghost, ...metadata } = source;
  return { ...metadata, buddy: definition };
}

export function createBuddyPackRegistry(sources) {
  const packs = sources.map((source) => {
    const normalized = normalizeBuddyPack(source);
    return validateBuddyPack({ ...normalized, ...normalized.buddy });
  });
  const ids = new Set();
  for (const pack of packs) {
    if (ids.has(pack.id)) throw new Error(`Duplicate buddy pack id "${pack.id}".`);
    ids.add(pack.id);
  }

  const defaults = packs.filter((pack) => pack.default === true);
  if (defaults.length !== 1) {
    throw new Error(`Buddy packs must define exactly one default; found ${defaults.length}.`);
  }

  return Object.freeze({
    all: Object.freeze(packs),
    defaultPack: defaults[0],
    get(id) {
      const pack = packs.find((item) => item.id === id);
      if (!pack) throw new Error(`Buddy pack "${id}" is not installed.`);
      return pack;
    },
  });
}

function validateBuddyPack(pack) {
  if (typeof pack.id !== "string" || !pack.id.trim()) {
    throw new Error("Buddy packs must have a non-empty id.");
  }
  if (typeof pack.name !== "string" || !pack.name.trim()) {
    throw new Error(`Buddy pack "${pack.id}" must have a name.`);
  }
  if (!pack.palette || typeof pack.palette !== "object" || Array.isArray(pack.palette)) {
    throw new Error(`Buddy pack "${pack.id}" must define its own palette.`);
  }
  if (typeof pack.palette.rim !== "string" || !pack.palette.rim.trim()) {
    throw new Error(`Buddy pack "${pack.id}" must define a silhouette rim color.`);
  }
  if (typeof pack.palette.backdrop !== "string" || !pack.palette.backdrop.trim()) {
    throw new Error(`Buddy pack "${pack.id}" must define a stage backdrop color.`);
  }
  if (!pack.frames || typeof pack.frames !== "object" || Array.isArray(pack.frames)) {
    throw new Error(`Buddy pack "${pack.id}" must define state frames.`);
  }
  for (const state of BUDDY_STATES) {
    const frames = pack.frames[state];
    if (!Array.isArray(frames) || frames.length === 0 || frames.some((frame) => typeof frame !== "string")) {
      throw new Error(`Buddy pack "${pack.id}" needs at least one SVG frame for "${state}".`);
    }
  }
  return Object.freeze({
    ...pack,
    palette: Object.freeze({ ...pack.palette }),
    frames: Object.freeze(Object.fromEntries(
      BUDDY_STATES.map((state) => [state, Object.freeze([...pack.frames[state]])]),
    )),
  });
}

import test from "node:test";
import assert from "node:assert/strict";
import ghostPack from "../src/buddy/packs/ghost.js";
import { BUDDY_STATES, createBuddyPackRegistry, normalizeBuddyPack } from "../src/buddy/pack-model.js";

test("the default buddy pack provides frames for all six states and an independent palette", () => {
  const registry = createBuddyPackRegistry([ghostPack]);
  assert.equal(registry.defaultPack.id, "ghost");
  assert.ok(registry.defaultPack.palette.rim);
  assert.ok(registry.defaultPack.palette.backdrop);
  for (const state of BUDDY_STATES) {
    const [frame] = registry.defaultPack.frames[state];
    assert.match(frame, /^<svg viewBox="0 0 16 16".*<\/svg>$/);
    assert.match(frame, /shape-rendering="crispEdges"/);
  }
});

test("legacy ghost skin data normalizes to the buddy field", () => {
  const legacy = { id: "legacy", name: "Legacy buddy", ghost: ghostPack.buddy };
  const normalized = normalizeBuddyPack(legacy);
  assert.deepEqual(normalized.buddy, ghostPack.buddy);
  assert.equal("ghost" in normalized, false);
  assert.equal(createBuddyPackRegistry([{ ...normalized, default: true }]).defaultPack.id, "legacy");
});

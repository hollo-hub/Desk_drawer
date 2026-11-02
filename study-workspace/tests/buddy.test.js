import test from "node:test";
import assert from "node:assert/strict";
import { sprite } from "../src/buddy/ghost-sprite.js";

test("ghost sprite renders every supported buddy state as crisp 16x16 SVG", () => {
  for (const state of ["idle", "blink", "focus", "done", "nudge", "paused"]) {
    const markup = sprite(state, 0, "lavender");
    assert.match(markup, /^<svg viewBox="0 0 16 16".*<\/svg>$/);
    assert.match(markup, /shape-rendering="crispEdges"/);
  }
});

test("ghost sprite alternates its hem frame and falls back to lavender", () => {
  assert.notEqual(sprite("idle", 0, "mint"), sprite("idle", 1, "mint"));
  assert.equal(sprite("idle", 0, "unknown"), sprite("idle", 0, "lavender"));
});

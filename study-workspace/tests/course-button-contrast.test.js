import test from "node:test";
import assert from "node:assert/strict";
import { contrastRatio, readableTextOn } from "../../src/core/theme-contrast.js";
import { COURSE_COLORS } from "../src/course-model.js";

const skins = ["classic", "arc", "mono", "paper"];
const modes = ["light", "dark"];
const accents = [...COURSE_COLORS.map(({ value }) => value), "#fffefc", "#050607"];

test("Add course button text remains at least 4.5:1 across skins, modes, and accent extremes", () => {
  for (const skin of skins) {
    for (const mode of modes) {
      for (const accent of accents) {
        const text = readableTextOn(accent);
        const ratio = contrastRatio(text, accent);
        assert.ok(
          ratio >= 4.5,
          `${skin} ${mode}: ${text} on ${accent} has contrast ${ratio.toFixed(2)}:1`,
        );
      }
    }
  }
});

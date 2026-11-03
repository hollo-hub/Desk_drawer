# Visual check

Runs the built app in headless Chromium with a stubbed Tauri backend and fixed time, takes screenshots
of every page and a few flows, and compares two runs pixel by pixel.

```text
cd tools/visual-check && npm install
# before a refactor:  npm run build (in study-workspace), then
node scenario.mjs ../../dist ./shots-before
# after the refactor: rebuild, then
node scenario.mjs ../../dist ./shots-after
node diff.mjs ./shots-before ./shots-after
```

On Windows, install a Chromium-compatible browser and set `CHROME_EXECUTABLE_PATH` to its executable before running the scenario. On other platforms, the bundled headless Chromium is used by default.

`diff.mjs` reports differing screenshots and whether the backend calls (`invoke`) were identical.
A 192x16 pixel strip around the buddy sprite can differ between identical runs because its hem
animates; anything else that differs is a real change.

The scenario also checks the V3 course hub, the recall/reveal/rating flow, the keyboard command
palette, flat Desk backgrounds, visible course actions, centered course and Settings dialogs,
Escape/backdrop closing, focus restoration, dirty-close confirmation, and a 700px dialog
viewport. It also checks that the window itself does not scroll, the Desk fits at 700, 800, and
1000px tall, hidden-scrollbar page areas respond to keyboard and wheel input, and dialogs scroll
with focus kept visible. It captures Desk, Notes, and History at 765px wide in both themes and at
all three heights. It screenshots Classic and Arc in both light and dark themes and every Study
skin in both themes. The Study-page screenshots are additive; compare the Desk, Resources, Notes,
Tasks, Stats, and History screenshots against the saved V2 baseline rather than treating the new
Study page as part of that baseline.

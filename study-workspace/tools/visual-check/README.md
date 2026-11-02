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

`diff.mjs` reports differing screenshots and whether the backend calls (`invoke`) were identical.
A 192x16 pixel strip around the ghost sprite can differ between identical runs because its hem
animates; anything else that differs is a real change.

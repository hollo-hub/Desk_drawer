import { BUDDY_STATES } from "../pack-model.js";

const row = (left, pixels) => ".".repeat(left) + pixels + ".".repeat(16 - left - pixels.length);
const fullRow = "B".repeat(16);
const top = [
  row(4, "B".repeat(8)),
  row(2, "B".repeat(12)),
  row(1, "B".repeat(14)),
  row(1, "B".repeat(14)),
  ...Array(9).fill(fullRow),
  fullRow,
  fullRow,
];
const feet = ["BBB..BBBBBB..BBB", ".BBB..BBBB..BBB."];
const palette = Object.freeze({
  body: "#b7a5f3",
  shade: "#9784dc",
  highlight: "#dcd2fb",
  ink: "#262338",
  white: "#ffffff",
  blush: "#f7a3b5",
  tear: "#8fd3ff",
  nudgeBody: "#8c9bf5",
  nudgeShade: "#6d7ae0",
  nudgeHighlight: "#b9c3ff",
  rim: "#262338",
  backdrop: "#f1edfc",
});

function face(state) {
  const pixels = [];
  const add = (color, ...points) => points.forEach(([x, y]) => pixels.push([x, y, color]));
  const blush = () => add("R", [2, 8], [3, 8], [12, 8], [13, 8]);
  const smile = () => add("M", [6, 8], [7, 9], [8, 9], [9, 8]);

  if (state === "idle" || state === "paused") {
    [4, 10].forEach((x) => {
      [5, 6, 7].forEach((y) => add("E", [x, y], [x + 1, y]));
      add("W", [x, 5]);
    });
    if (state === "idle") {
      blush();
      smile();
    }
  } else if (state === "blink") {
    [4, 10].forEach((x) => add("E", [x, 7], [x + 1, 7]));
    blush();
    smile();
  } else if (state === "focus") {
    [4, 10].forEach((x) => {
      [6, 7].forEach((y) => add("E", [x, y], [x + 1, y]));
      add("S", [x - 1, 5], [x, 5], [x + 1, 5], [x + 2, 5]);
    });
    add("M", [7, 9], [8, 9]);
  } else if (state === "done") {
    [3, 10].forEach((x) => add("E", [x, 7], [x + 1, 6], [x + 2, 7]));
    blush();
    add("M", [7, 8], [8, 8], [7, 9], [8, 9]);
  } else if (state === "nudge") {
    [4, 10].forEach((x) => add("E", [x, 5], [x, 6]));
    add("M", [4, 10], [5, 9], [6, 10], [7, 9], [8, 10], [9, 9], [10, 10], [11, 9]);
    add("T", [13, 3], [13, 4]);
  }
  return pixels;
}

function renderFrame(state, frame) {
  const statePalette = state === "nudge"
    ? {
      ...palette,
      body: palette.nudgeBody,
      shade: palette.nudgeShade,
      highlight: palette.nudgeHighlight,
    }
    : palette;
  const grid = [...top, feet[frame % feet.length]].map((line) => [...line]);
  grid.forEach((line, y) => line.forEach((pixel, x) => {
    if (pixel === "B" && x >= 13 && y >= 5) line[x] = "S";
  }));
  [[4, 1], [3, 2], [2, 3], [2, 4]].forEach(([x, y]) => {
    if (grid[y][x] === "B") grid[y][x] = "h";
  });
  face(state).forEach(([x, y, color]) => {
    grid[y][x] = color;
  });

  const colors = {
    B: statePalette.body,
    S: statePalette.shade,
    h: statePalette.highlight,
    E: statePalette.ink,
    W: statePalette.white,
    R: statePalette.blush,
    M: statePalette.ink,
    T: statePalette.tear,
  };
  const opacity = state === "paused" ? 0.2 : 1;
  const rectangles = grid.flatMap((line, y) => line.flatMap((pixel, x) => {
    const color = colors[pixel];
    if (!color) return [];
    const fade = pixel === "B" || pixel === "S" || pixel === "h" ? ` fill-opacity="${opacity}"` : "";
    return [`<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"${fade}/>`];
  })).join("");
  return `<svg viewBox="0 0 16 16" width="100%" height="100%" shape-rendering="crispEdges">${rectangles}</svg>`;
}

const frames = Object.fromEntries(BUDDY_STATES.map((state) => [
  state,
  Object.freeze([renderFrame(state, 0), renderFrame(state, 1)]),
]));

export default Object.freeze({
  id: "ghost",
  name: "Ghost",
  default: true,
  buddy: Object.freeze({ palette, frames: Object.freeze(frames) }),
});

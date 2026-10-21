import { THEMES } from './themes.js';
import { Cat } from './cat.js';
import { Backdrop, drawStage, drawPillars, drawHalo, Orbit, Cursor, DEFAULT_FAVORITES, clearIconCache } from './stage.js';
import { loadSettings, saveSettings, native } from './settings.js';
import { registerPanel, openPanel, closePanel, notice } from './panels.js';
import { initPalette } from './palette.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const cat = new Cat();
const cursor = new Cursor();
const focus = { running: false, total: 0, remaining: 0 };
const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

let S, themeId, theme, W, H, DPR, backdrop, orbit, scale = 6, t = 0, last = performance.now(), lastInput = performance.now(), happyUntil = 0;
let mouse = { x: -1, y: -1, nx: 0, ny: 0, inside: false };
const L = {};

const api = {
  get settings() { return S; },
  async set(patch) { S = Object.assign({}, S, patch); const r = await saveSettings(S); if (!r.ok) fail(r.message); if ('theme' in patch) applyTheme(S.theme); if ('favorites' in patch) buildOrbit(); },
  startFocus(minutes) { focus.total = focus.remaining = minutes * 60; focus.running = true; closePanel(); },
  stopFocus() { focus.running = false; },
  get focus() { return focus; },
  openPanel: (id) => openPanel(id, api),
  toggleTools: () => { orbit.toggle(); cat.hop(0.8); },
  cat,
  fail,
};

function fail(message) { notice(message); cat.surprise(); }

function reduce() { return S.motion === 'reduced' || reduceQuery.matches; }
function haloColor() { return S.haloColor || theme.halo; }

function applyTheme(id) {
  themeId = THEMES[id] ? id : 'night';
  theme = THEMES[themeId];
  clearIconCache();
  const r = document.documentElement;
  const v = { '--text': theme.text, '--text-dim': theme.textDim, '--accent': theme.accent, '--accent2': theme.accent2, '--glass-fill': theme.glass.fill, '--glass-stroke': theme.glass.stroke, '--radius': theme.radius + 'px', '--border': theme.border + 'px', '--font': theme.font };
  Object.keys(v).forEach((k) => r.style.setProperty(k, v[k]));
  r.dataset.mode = theme.mode;
  r.dataset.theme = themeId;
}

function buildOrbit() {
  const all = { scenes: 'Scenes', focus: 'Focus', clipboard: 'Clipboard', links: 'Links', notes: 'Notes', tidy: 'Tidy', rename: 'Rename', layouts: 'Layouts', picker: 'Color', awake: 'Keep awake' };
  const items = S.favorites.filter((id) => all[id]).map((id) => ({ id, label: all[id], icon: id }));
  const wasOpen = orbit ? orbit.open : false;
  orbit = new Orbit(items.length ? items : DEFAULT_FAVORITES);
  if (wasOpen) { orbit.open = true; orbit.items.forEach((i) => (i.t = 1)); }
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = false;
  backdrop = new Backdrop(W, H);
  scale = Math.max(4, Math.min(12, Math.floor((H * 0.42) / 32)));
  L.stageW = 32 * scale * 1.8;
  L.stageCY = H * 0.74;
  L.catW = 32 * scale;
  L.catX = (W - L.catW) / 2;
  L.catY = L.stageCY + 2 * scale - 32 * scale;
  L.cx = W / 2; L.cy = L.catY + 16 * scale;
  L.haloY = L.catY - 2 * scale;
}

function inCat(x, y) { return x > L.catX && x < L.catX + L.catW && y > L.catY && y < L.catY + L.catW; }

function update(dt) {
  const rm = reduce();
  if (focus.running) {
    focus.remaining -= dt;
    if (focus.remaining <= 0) {
      focus.running = false; focus.remaining = 0;
      cat.yawn(); cat.hop(1); happyUntil = t + 5;
      native.invoke('notify', { title: 'Focus complete', body: 'Time for a break.' }).catch((e) => console.warn('notification not shown', e));
      document.dispatchEvent(new CustomEvent('focus:done'));
    }
  }
  const idleFor = (performance.now() - lastInput) / 1000;
  cat.setMood(focus.running ? 'focus' : t < happyUntil ? 'happy' : idleFor > 600 ? 'sleep' : 'idle');
  cat.setLook(mouse.nx, mouse.ny, mouse.inside && !focus.running);
  cat.update(dt, rm);
  orbit.update(dt, L.cx, L.haloY, L.cx, L.cy, scale, rm);
  cursor.update(dt);
}

function draw() {
  const rm = reduce();
  backdrop.draw(ctx, theme, t, mouse.nx, mouse.ny * -1, rm);
  drawPillars(ctx, W, H, theme, t, rm);
  drawStage(ctx, W / 2, L.stageCY, L.stageW, theme);
  orbit.draw(ctx, theme, themeId, 'back');
  cat.draw(ctx, themeId, L.catX, L.catY, scale);
  const frac = focus.running ? Math.max(0.02, focus.remaining / focus.total) : 1;
  const bob = rm ? 0 : Math.sin(t * 2) * 2;
  drawHalo(ctx, L.cx, L.haloY + bob + cat.hopOffset() * scale, 13 * scale, 3 * scale, frac, haloColor(), t, Math.max(2, scale), rm);
  orbit.draw(ctx, theme, themeId, 'front');
  if (S.customCursor) cursor.draw(ctx, orbit.hover >= 0 ? theme.accent2 : haloColor(), orbit.hover >= 0);
}

function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) { last = now; return; }
  const minDt = S.motion === 'eco' ? 1 / 30 : 0;
  let dt = (now - last) / 1000;
  if (dt < minDt) return;
  last = now; dt = Math.min(dt, 0.05); t += dt;
  update(dt); draw();
}

function pointer(e) {
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.inside = true;
  mouse.nx = Math.max(-1, Math.min(1, (mouse.x - L.cx) / (W / 2)));
  mouse.ny = Math.max(-1, Math.min(1, (L.cy - mouse.y) / (H / 2)));
  lastInput = performance.now();
}

function bind() {
  canvas.addEventListener('pointermove', (e) => { pointer(e); cursor.move(mouse.x, mouse.y, haloColor(), reduce()); orbit.hover = orbit.hit(mouse.x, mouse.y); });
  canvas.addEventListener('pointerleave', () => { mouse.inside = false; cursor.leave(); orbit.hover = -1; });
  canvas.addEventListener('pointerdown', (e) => {
    pointer(e);
    cursor.burst(mouse.x, mouse.y, haloColor(), reduce());
    const i = orbit.hit(mouse.x, mouse.y);
    if (i >= 0) { orbit.items[i].pulse = 1; api.openPanel(orbit.items[i].id); }
    else if (inCat(mouse.x, mouse.y)) { orbit.toggle(); cat.hop(1); }
    else cat.hop(0.4);
  });
  canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); if (inCat(mouse.x, mouse.y)) api.openPanel('buddy'); });
  window.addEventListener('resize', resize);
  document.addEventListener('keydown', (e) => { lastInput = performance.now(); if (e.key === 'Escape') closePanel(); });
}

async function boot() {
  const loaded = await loadSettings();
  S = loaded.settings;
  applyTheme(S.theme);
  resize();
  buildOrbit();
  initPalette(api);
  bind();
  if (loaded.warning) fail(loaded.warning);
  if (!S.onboarded) api.openPanel('welcome');
  requestAnimationFrame(frame);
}
boot();

import { ICONS } from './sprites.js';

function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = Math.round;

export class Backdrop {
  constructor(w, h) { this.resize(w, h); }
  resize(w, h) {
    this.w = w; this.h = h;
    const r = rng(7);
    this.pts = [];
    for (let i = 0; i < 150; i++) this.pts.push({ x: r() * w, y: r() * h, s: r() < 0.15 ? 4 : 2, p: r() * 6.28, v: 0.4 + r() * 1.2, c: Math.floor(r() * 3) });
    this.cols = [];
    for (let x = 0; x < w; x += 14) this.cols.push({ x, p: r() * 300, v: 0.5 + r() * 1.2 });
  }
  draw(ctx, theme, t, mx, my, reduce) {
    const { w, h } = this;
    const sky = theme.sky.filter(Boolean);
    if (!sky.length) ctx.clearRect(0, 0, w, h);
    else sky.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, R((h * i) / sky.length), w, Math.ceil(h / sky.length) + 1); });
    const cols = theme.bg.colors;
    const px = reduce ? 0 : mx, py = reduce ? 0 : my;
    switch (theme.bg.mode) {
      case 'stars':
        this.pts.forEach((p) => {
          ctx.globalAlpha = reduce ? 0.8 : 0.45 + 0.55 * Math.abs(Math.sin(t * p.v + p.p));
          ctx.fillStyle = cols[p.c % cols.length];
          ctx.fillRect(R(p.x - px * 6 * (p.s / 2)), R(p.y - py * 3 * (p.s / 2)), p.s, p.s);
        });
        break;
      case 'snow':
        this.pts.forEach((p) => {
          const yy = reduce ? p.y : (p.y + t * 18 * p.v) % h, xx = reduce ? p.x : p.x + Math.sin(t * 0.7 + p.p) * 12;
          ctx.globalAlpha = 0.9; ctx.fillStyle = cols[p.c % cols.length];
          ctx.fillRect(R(xx / 2) * 2, R(yy / 2) * 2, p.s, p.s);
        });
        break;
      case 'dots':
        ctx.fillStyle = cols[0]; ctx.globalAlpha = 1;
        for (let y = 12; y < h; y += 24) for (let x = 12; x < w; x += 24) ctx.fillRect(x, y, 2, 2);
        break;
      case 'fireflies':
        this.pts.slice(0, 40).forEach((p) => {
          const xx = p.x + (reduce ? 0 : Math.sin(t * 0.4 * p.v + p.p) * 30), yy = p.y + (reduce ? 0 : Math.cos(t * 0.3 * p.v + p.p) * 20);
          const a = 0.4 + 0.6 * Math.abs(Math.sin(t * p.v + p.p));
          ctx.fillStyle = cols[p.c % cols.length];
          ctx.globalAlpha = a * 0.18; ctx.fillRect(R(xx) - 4, R(yy) - 4, 10, 10);
          ctx.globalAlpha = a; ctx.fillRect(R(xx), R(yy), 3, 3);
        });
        break;
      case 'matrix':
        this.cols.forEach((c) => {
          const head = reduce ? c.p % h : (c.p + t * 40 * c.v) % (h + 90);
          for (let k = 0; k < 6; k++) { ctx.globalAlpha = 0.9 - k * 0.15; ctx.fillStyle = cols[k === 0 ? 0 : 1]; ctx.fillRect(c.x, R(head - k * 10), 4, 4); }
        });
        break;
      default: break;
    }
    ctx.globalAlpha = 1;
  }
}

function poly(ctx, pts, fill, stroke, lw) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(R(p[0]), R(p[1])) : ctx.moveTo(R(p[0]), R(p[1]))));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

export function drawStage(ctx, cx, cy, w, theme) {
  const s = theme.stage, h = w / 2, th = 18, st = theme.glass.stroke, lw = theme.border;
  const L = cx - w / 2, Rr = cx + w / 2, T = cy - h / 2, B = cy + h / 2;
  poly(ctx, [[L, cy], [cx, B], [cx, B + th], [L, cy + th]], s.left, st, lw);
  poly(ctx, [[cx, B], [Rr, cy], [Rr, cy + th], [cx, B + th]], s.right, st, lw);
  poly(ctx, [[cx, T], [Rr, cy], [cx, B], [L, cy]], s.top, st, lw);
  const k = 0.62;
  poly(ctx, [[cx, cy - (h / 2) * k], [cx + (w / 2) * k, cy], [cx, cy + (h / 2) * k], [cx - (w / 2) * k, cy]], s.rug, null, 0);
}

export function drawPillars(ctx, w, h, theme, t, reduce) {
  const s = theme.stage, bob = reduce ? 0 : Math.sin(t * 0.8) * 3;
  const block = (x, y, bw, bh) => {
    poly(ctx, [[x, y], [x + bw / 2, y + bw / 4], [x + bw / 2, y + bw / 4 + bh], [x, y + bh]], s.left, theme.glass.stroke, theme.border);
    poly(ctx, [[x + bw / 2, y + bw / 4], [x + bw, y], [x + bw, y + bh], [x + bw / 2, y + bw / 4 + bh]], s.right, theme.glass.stroke, theme.border);
    poly(ctx, [[x, y], [x + bw / 2, y - bw / 4], [x + bw, y], [x + bw / 2, y + bw / 4]], s.top, theme.glass.stroke, theme.border);
  };
  block(w * 0.08, h * 0.28 + bob, 64, 150);
  block(w * 0.86, h * 0.36 - bob, 56, 110);
}

export function drawHalo(ctx, cx, cy, rx, ry, frac, color, t, unit, reduce) {
  const N = 72;
  ctx.save();
  ctx.fillStyle = color;
  const pulse = frac > 0 && frac < 0.1 && !reduce ? 0.5 + 0.5 * Math.sin(t * 8) : 1;
  const seen = new Set();
  for (let i = 0; i < N; i++) {
    const a = -Math.PI / 2 + (i / N) * Math.PI * 2;
    const x = R((cx + Math.cos(a) * rx) / unit) * unit, y = R((cy + Math.sin(a) * ry) / unit) * unit;
    const key = x + ',' + y;
    if (seen.has(key)) continue;
    seen.add(key);
    const on = i / N < frac;
    if (on) { ctx.globalAlpha = 0.16 * pulse; ctx.fillRect(x - unit, y - unit, unit * 3, unit * 3); }
    ctx.globalAlpha = (on ? 1 : 0.16) * (on ? pulse : 1);
    ctx.fillRect(x, y, unit, unit);
  }
  ctx.restore();
}

const iconCache = new Map();
export function iconCanvas(name, theme, themeId) {
  const key = themeId + '|' + name;
  if (iconCache.has(key)) return iconCache.get(key);
  const pal = { k: theme.text, f: theme.mode === 'light' ? '#ffffff' : '#2b2b4a', A: theme.accent, a: theme.accent2, B: '#2b2430', Y: '#f2d35b', N: '#e89aa8' };
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const x = c.getContext('2d');
  ICONS[name].forEach((row, j) => { for (let i = 0; i < 16; i++) { const ch = row[i]; if (ch !== '.') { x.fillStyle = pal[ch]; x.fillRect(i, j, 1, 1); } } });
  iconCache.set(key, c);
  return c;
}
export function clearIconCache() { iconCache.clear(); }

export const DEFAULT_FAVORITES = [
  { id: 'scenes', label: 'Scenes', icon: 'scenes' },
  { id: 'focus', label: 'Focus', icon: 'focus' },
  { id: 'clipboard', label: 'Clipboard', icon: 'clipboard' },
  { id: 'links', label: 'Links', icon: 'links' },
  { id: 'notes', label: 'Notes', icon: 'notes' },
];

export class Orbit {
  constructor(items) { this.setItems(items || DEFAULT_FAVORITES); this.open = false; this.angle = 0; this.hover = -1; }
  setItems(items) {
    this.items = items.slice(0, 6).map((d) => Object.assign({ t: 0, v: 0, wait: 0, s: 1, pulse: 0, x: 0, y: 0, depth: 0 }, d));
  }
  toggle() { this.open = !this.open; this.items.forEach((it, i) => (it.wait = i * 0.08)); }
  update(dt, haloX, haloY, catX, catY, scale, reduce) {
    if (!reduce) this.angle += dt * 0.35;
    const n = this.items.length, rx = 15 * scale, ry = 5 * scale;
    this.items.forEach((it, i) => {
      const tg = this.open ? 1 : 0;
      if (it.wait > 0) it.wait -= dt;
      else if (reduce) it.t = tg;
      else { it.v += (tg - it.t) * 70 * dt; it.v *= Math.exp(-6 * dt); it.t += it.v * dt; }
      it.s += ((this.hover === i ? 1.25 : 1) - it.s) * Math.min(1, dt * 12);
      it.pulse = Math.max(0, it.pulse - dt * 2.5);
      const a = (i / n) * Math.PI * 2 + this.angle;
      const hx = catX + Math.sin(a) * rx, hy = catY + Math.cos(a) * ry - ((i * 7) % 5) * scale * 1.2;
      it.x = haloX + (hx - haloX) * it.t; it.y = haloY + (hy - haloY) * it.t;
      it.depth = Math.cos(a);
    });
  }
  hit(x, y) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.t > 0.6 && Math.abs(x - it.x) < 24 * it.s && Math.abs(y - it.y) < 24 * it.s) return i;
    }
    return -1;
  }
  draw(ctx, theme, themeId, layer) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    this.items.forEach((it, i) => {
      if (it.t < 0.03 || (layer === 'back') !== (it.depth < 0)) return;
      const sc = Math.max(0.01, it.t) * it.s * (1 + it.pulse * 0.3), size = 44 * sc, x = R(it.x - size / 2), y = R(it.y - size / 2);
      ctx.globalAlpha = Math.min(1, it.t * 1.5);
      ctx.fillStyle = theme.mode === 'light' ? 'rgba(255,255,255,0.75)' : 'rgba(18,18,40,0.7)';
      ctx.fillRect(x, y, R(size), R(size));
      ctx.fillStyle = theme.glass.fill; ctx.fillRect(x, y, R(size), R(size));
      ctx.strokeStyle = theme.glass.stroke; ctx.lineWidth = Math.max(1, theme.border);
      ctx.strokeRect(x + 0.5, y + 0.5, R(size) - 1, R(size) - 1);
      ctx.drawImage(iconCanvas(it.icon, theme, themeId), R(it.x - 16 * sc), R(it.y - 16 * sc), R(32 * sc), R(32 * sc));
      if (this.hover === i && layer === 'front') {
        ctx.globalAlpha = 1; ctx.fillStyle = theme.text; ctx.font = '12px ' + theme.font; ctx.textAlign = 'center';
        ctx.fillText(it.label, R(it.x), R(it.y + size / 2 + 14));
      }
    });
    ctx.restore();
  }
}

export class Cursor {
  constructor() { this.p = []; this.x = 0; this.y = 0; this.on = false; this.lx = -99; this.ly = -99; }
  move(x, y, color, reduce) {
    this.x = x; this.y = y; this.on = true;
    if (!reduce && Math.hypot(x - this.lx, y - this.ly) > 7) { this.spark(x, y, 1, false, color); this.lx = x; this.ly = y; }
  }
  leave() { this.on = false; }
  spark(x, y, n, burst, color) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, sp = burst ? 60 + Math.random() * 130 : 10 + Math.random() * 25;
      this.p.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (burst ? 0 : 8), l: 1, d: burst ? 1.1 : 1.8, sz: burst ? (Math.random() < 0.5 ? 4 : 8) : 4, c: Math.random() < 0.3 ? '#ffffff' : color });
    }
  }
  burst(x, y, color, reduce) { if (!reduce) this.spark(x, y, 14, true, color); }
  update(dt) {
    for (let i = this.p.length - 1; i >= 0; i--) {
      const q = this.p[i]; q.l -= dt / q.d;
      if (q.l <= 0) { this.p.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 40 * dt;
    }
  }
  draw(ctx, color, big) {
    this.p.forEach((q) => { ctx.globalAlpha = q.l; ctx.fillStyle = q.c; ctx.fillRect(R(q.x / 4) * 4, R(q.y / 4) * 4, q.sz, q.sz); });
    ctx.globalAlpha = 1;
    if (!this.on) return;
    const u = big ? 4 : 3, r = (a, b, w, h) => ctx.fillRect(R(this.x + a * u), R(this.y + b * u), w * u, h * u);
    ctx.fillStyle = color;
    r(-5, -2, 2, 2); r(-2, -4, 2, 2); r(1, -4, 2, 2); r(4, -2, 2, 2); r(-3, 0, 6, 4); r(-4, 1, 8, 2);
  }
}

import { BASE, EYES, MOUTH, NOSE, WHISKERS, TAIL, EAR_TWITCH, WAVE, ACC, BASEPAL } from './sprites.js';
import { THEMES } from './themes.js';

export const STATES = {
  idle:      { eyes: 'open',      mouth: 'neutral', tail: 1 },
  blink:     { eyes: 'blink',     mouth: 'neutral', tail: 1 },
  happy:     { eyes: 'happy',     mouth: 'smile',   tail: 2 },
  sleep:     { eyes: 'sleep',     mouth: 'flat',    tail: 1 },
  focus:     { eyes: 'focus',     mouth: 'flat',    tail: 1 },
  wide:      { eyes: 'wide',      mouth: 'open',    tail: 0 },
  lookLeft:  { eyes: 'lookLeft',  mouth: 'neutral', tail: 1 },
  lookRight: { eyes: 'lookRight', mouth: 'neutral', tail: 1 },
  yawn:      { eyes: 'sleep',     mouth: 'open',    tail: 1 },
  wave:      { eyes: 'happy',     mouth: 'smile',   tail: 2, wave: true },
  twitch:    { eyes: 'open',      mouth: 'neutral', tail: 1, ear: true },
};

function stamp(g, o) {
  for (let j = 0; j < o.rows.length; j++) {
    const row = o.rows[j];
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c === '.') continue;
      const x = o.x + i, y = o.y + j;
      if (x >= 0 && x < 32 && y >= 0 && y < 32) g[y][x] = c === '_' ? '.' : c;
    }
  }
}

export function compose(state, themeId) {
  const g = BASE.map((r) => r.split(''));
  WHISKERS.forEach((w) => stamp(g, w));
  stamp(g, TAIL[state.tail]);
  if (state.ear) stamp(g, EAR_TWITCH);
  if (state.wave) stamp(g, WAVE);
  const e = EYES[state.eyes];
  stamp(g, { x: 8, y: e.y, rows: e.rows });
  stamp(g, { x: 19, y: e.y, rows: e.rows });
  stamp(g, NOSE);
  stamp(g, MOUTH[state.mouth]);
  (ACC[themeId] || []).forEach((o) => stamp(g, o));
  return g.map((r) => r.join(''));
}

export function paletteFor(themeId) {
  return Object.assign({}, BASEPAL, THEMES[themeId].cat);
}

const cache = new Map();
export function spriteCanvas(state, themeId) {
  const key = [themeId, state.eyes, state.mouth, state.tail, state.ear ? 1 : 0, state.wave ? 1 : 0].join('|');
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d');
  const pal = paletteFor(themeId);
  compose(state, themeId).forEach((row, y) => {
    for (let i = 0; i < 32; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      x.fillStyle = pal[ch];
      x.fillRect(i, y, 1, 1);
    }
  });
  cache.set(key, c);
  return c;
}
export function clearSpriteCache() { cache.clear(); }

const TAIL_CYCLE = [0, 1, 2, 1];

export class Cat {
  constructor() {
    this.mood = 'idle';
    this.t = 0;
    this.blinkIn = 2.5;
    this.blinkT = -1;
    this.twitchIn = 5;
    this.twitchT = -1;
    this.hopT = -1;
    this.hopPower = 1;
    this.yawnT = -1;
    this.surpriseT = -1;
    this.look = { x: 0, y: 0, active: false };
  }
  setMood(m) { this.mood = m; }
  hop(power = 1) { this.hopT = 0; this.hopPower = power; }
  yawn() { this.yawnT = 0; }
  surprise() { this.surpriseT = 0; }
  setLook(nx, ny, active) { this.look.x = nx; this.look.y = ny; this.look.active = active; }
  update(dt, reduceMotion) {
    this.t += dt;
    this.blinkIn -= dt;
    if (this.blinkIn <= 0 && this.blinkT < 0) { this.blinkT = 0; this.blinkIn = 2 + Math.random() * 3.5; }
    if (this.blinkT >= 0) { this.blinkT += dt; if (this.blinkT > 0.14) this.blinkT = -1; }
    this.twitchIn -= dt;
    if (this.twitchIn <= 0 && this.twitchT < 0) { this.twitchT = 0; this.twitchIn = 4 + Math.random() * 5; }
    if (this.twitchT >= 0) { this.twitchT += dt; if (this.twitchT > 0.2) this.twitchT = -1; }
    if (this.hopT >= 0) { this.hopT += dt / 0.6; if (this.hopT >= 1) this.hopT = -1; }
    if (this.yawnT >= 0) { this.yawnT += dt; if (this.yawnT > 1.2) this.yawnT = -1; }
    if (this.surpriseT >= 0) { this.surpriseT += dt; if (this.surpriseT > 1) this.surpriseT = -1; }
    this.reduce = !!reduceMotion;
  }
  state(themeId) {
    const tail = this.reduce ? 1 : TAIL_CYCLE[Math.floor(this.t / 0.25) % 4];
    let s;
    if (this.surpriseT >= 0) s = Object.assign({}, STATES.wide);
    else if (this.yawnT >= 0) s = Object.assign({}, STATES.yawn);
    else if (this.mood === 'sleep') s = Object.assign({}, STATES.sleep);
    else if (this.mood === 'focus') s = Object.assign({}, STATES.focus);
    else if (this.mood === 'happy') s = Object.assign({}, this.hopT >= 0 ? STATES.wave : STATES.happy);
    else if (this.mood === 'carried' || this.mood === 'fall') s = Object.assign({}, STATES.wide);
    else if (this.blinkT >= 0) s = Object.assign({}, STATES.blink);
    else {
      s = Object.assign({}, STATES.idle);
      if (themeId === 'night') s.eyes = 'focus';
      if (this.look.active) {
        const ax = Math.abs(this.look.x), ay = Math.abs(this.look.y);
        if (ax > 0.25 && ax >= ay) s.eyes = this.look.x < 0 ? 'lookLeft' : 'lookRight';
        else if (ay > 0.25) s.eyes = this.look.y > 0 ? 'lookUp' : 'lookDown';
      }
      if (this.twitchT >= 0 && !this.reduce) s.ear = true;
    }
    if (!(this.mood === 'happy' && this.hopT >= 0)) s.tail = tail;
    return s;
  }
  hopOffset() {
    if (this.hopT < 0 || this.reduce) return 0;
    return -Math.round(Math.sin(this.hopT * Math.PI) * 8 * this.hopPower);
  }
  draw(ctx, themeId, x, y, scale) {
    const spr = spriteCanvas(this.state(themeId), themeId);
    const a = THEMES[themeId].catAlpha || 1;
    const bob = this.reduce ? 0 : (Math.sin(this.t * 2) > 0.6 ? -1 : 0);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = a;
    ctx.drawImage(spr, Math.round(x), Math.round(y + (this.hopOffset() + bob) * scale), 32 * scale, 32 * scale);
    ctx.restore();
  }
}

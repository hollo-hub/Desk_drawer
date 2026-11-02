export const DEFAULT_INTERFACE_MOTION = Object.freeze({
  drawer_style: 'slide',
  dock_magnification: true,
  rubber_band: true,
  cursor_tilt: false,
  reminder_bounce: true,
  taskbar_flash: false,
  list_item_motion: true,
  loading_idle: true,
  theme_crossfade: true,
});

const DRAWER_STYLES = new Set(['slide', 'pop', 'instant']);
const EFFECT_KEYS = Object.keys(DEFAULT_INTERFACE_MOTION).filter((key) => key !== 'drawer_style');

export function normalizeInterfaceMotion(settings = {}) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new TypeError('Interface motion settings must be an object.');
  }
  const normalized = { ...DEFAULT_INTERFACE_MOTION, ...settings };
  if (!DRAWER_STYLES.has(normalized.drawer_style)) {
    throw new TypeError('Drawer style must be slide, pop, or instant.');
  }
  for (const key of EFFECT_KEYS) {
    if (typeof normalized[key] !== 'boolean') {
      throw new TypeError(`${key} must be a boolean.`);
    }
  }
  return Object.freeze(normalized);
}

export function dockMagnification(distance, radius = 84, maximum = 1.35) {
  if (!Number.isFinite(distance) || !Number.isFinite(radius) || !Number.isFinite(maximum)) {
    throw new TypeError('Dock magnification inputs must be finite numbers.');
  }
  if (radius <= 0 || maximum < 1) throw new RangeError('Dock magnification range is invalid.');
  const proximity = Math.max(0, Math.min(1, 1 - Math.abs(distance) / radius));
  const falloff = proximity * proximity * (3 - 2 * proximity);
  return 1 + (maximum - 1) * falloff;
}

export function cursorTiltFromPoint(clientX, clientY, rect, maximumDegrees = 3) {
  if (![clientX, clientY, rect?.left, rect?.top, rect?.width, rect?.height, maximumDegrees]
    .every(Number.isFinite)) {
    throw new TypeError('Cursor tilt requires finite point and bounds values.');
  }
  if (rect.width <= 0 || rect.height <= 0 || maximumDegrees < 0 || maximumDegrees > 3) {
    throw new RangeError('Cursor tilt bounds are invalid.');
  }
  const normalizedX = Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width) * 2 - 1));
  const normalizedY = Math.max(-1, Math.min(1, ((clientY - rect.top) / rect.height) * 2 - 1));
  return Object.freeze({
    x: -normalizedY * maximumDegrees || 0,
    y: normalizedX * maximumDegrees || 0,
  });
}

export function optionalMotionAllowed({
  enabled,
  reducedMotion,
  ecoMode,
  visible = true,
  glass = false,
}) {
  return Boolean(enabled && !reducedMotion && !ecoMode && !glass && visible);
}

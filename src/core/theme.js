export const THEME_SCHEMA_VERSION = 1;
export const THEME_FILE_LIMIT_BYTES = 50 * 1024;
export const THEME_NAME_LIMIT = 60;

const REQUIRED_COLORS = ['bg', 'wall', 'drawer', 'edge', 'ink', 'accent', 'buddy', 'desk'];
const OPTIONAL_COLORS = ['inkSecondary', 'inkMuted', 'danger', 'success', 'warning'];
const THEME_FIELDS = new Set([
  ...REQUIRED_COLORS,
  ...OPTIONAL_COLORS,
  'font',
  'borderWidth',
  'cornerStyle',
  'shadowStyle',
  'effects',
  'background',
  'stickers',
  'meta',
  'schemaVersion',
]);
const EFFECT_FIELDS = new Set([
  'windowEffect',
  'panelOpacity',
  'textOutline',
  'scanlines',
]);
const META_FIELDS = new Set([
  'id',
  'name',
  'author',
  'version',
  'license',
  'description',
]);
const NUMERIC = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const RGB_COMPONENT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(%)?$/;
const EXTERNAL_URL = /(?:https?:\/\/|ftp:\/\/|data:|javascript:)/i;

function isRecord(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function expectRecord(value, name) {
  if (!isRecord(value)) throw new Error(`${name} must be a JSON object.`);
}

function expectKeys(value, allowed, name) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Unknown ${name} field "${key}".`);
  }
}

function clampByte(value) {
  return Math.max(0, Math.min(255, value));
}

function parseChannel(value) {
  if (!RGB_COMPONENT.test(value)) throw new Error('RGB channels must be numbers or percentages.');
  const percentage = value.endsWith('%');
  const numeric = Number(percentage ? value.slice(0, -1) : value);
  const maximum = percentage ? 100 : 255;
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > maximum) {
    throw new Error(`RGB channels must be between 0 and ${maximum}${percentage ? '%' : ''}.`);
  }
  return clampByte(percentage ? numeric * 255 / 100 : numeric);
}

function parseAlpha(value) {
  const percentage = value.endsWith('%');
  const numeric = Number(percentage ? value.slice(0, -1) : value);
  const maximum = percentage ? 100 : 1;
  if (!NUMERIC.test(percentage ? value.slice(0, -1) : value)
    || !Number.isFinite(numeric) || numeric < 0 || numeric > maximum) {
    throw new Error('Alpha must be between 0 and 1, or between 0% and 100%.');
  }
  return percentage ? numeric / 100 : numeric;
}

function hueToRgb(p, q, hue) {
  let t = hue;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function parseHslParts(value) {
  const match = value.match(/^(hsla?)\((.*)\)$/i);
  if (!match) return null;
  const parts = match[2].split(',').map((part) => part.trim());
  const hasAlpha = match[1].toLowerCase() === 'hsla';
  if (parts.length !== (hasAlpha ? 4 : 3)) {
    throw new Error(`${match[1]}() has the wrong number of color components.`);
  }
  const hueMatch = parts[0].match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:deg)?$/i);
  if (!hueMatch) throw new Error('HSL hue must be a number of degrees.');
  const hue = ((Number(hueMatch[1]) % 360) + 360) % 360 / 360;
  const saturationMatch = parts[1].match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))%$/);
  const lightnessMatch = parts[2].match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))%$/);
  if (!saturationMatch || !lightnessMatch) {
    throw new Error('HSL saturation and lightness must be percentages.');
  }
  const saturation = Number(saturationMatch[1]) / 100;
  const lightness = Number(lightnessMatch[1]) / 100;
  if (![saturation, lightness].every((part) => Number.isFinite(part) && part >= 0 && part <= 1)) {
    throw new Error('HSL saturation and lightness must be between 0% and 100%.');
  }

  if (saturation === 0) {
    const gray = lightness * 255;
    return { r: gray, g: gray, b: gray, a: hasAlpha ? parseAlpha(parts[3]) : 1 };
  }

  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  return {
    r: hueToRgb(p, q, hue + 1 / 3) * 255,
    g: hueToRgb(p, q, hue) * 255,
    b: hueToRgb(p, q, hue - 1 / 3) * 255,
    a: hasAlpha ? parseAlpha(parts[3]) : 1,
  };
}

export function parseThemeColor(value) {
  if (typeof value !== 'string') throw new Error('Theme colors must be strings.');
  const color = value.trim();
  if (!color || /[{};]/.test(color) || color.includes('/*') || color.includes('*/')) {
    throw new Error('Color contains disallowed CSS syntax.');
  }
  if (/^transparent$/i.test(color)) return { r: 0, g: 0, b: 0, a: 0 };

  const hex = color.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      digits = [...digits].map((digit) => `${digit}${digit}`).join('');
    }
    const hasAlpha = digits.length === 8;
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: hasAlpha ? parseInt(digits.slice(6, 8), 16) / 255 : 1,
    };
  }

  const hsl = parseHslParts(color);
  if (hsl) return hsl;

  const rgb = color.match(/^(rgba?)\((.*)\)$/i);
  if (rgb) {
    const parts = rgb[2].split(',').map((part) => part.trim());
    const hasAlpha = rgb[1].toLowerCase() === 'rgba';
    if (parts.length !== (hasAlpha ? 4 : 3)) {
      throw new Error(`${rgb[1]}() has the wrong number of color components.`);
    }
    return {
      r: parseChannel(parts[0]),
      g: parseChannel(parts[1]),
      b: parseChannel(parts[2]),
      a: hasAlpha ? parseAlpha(parts[3]) : 1,
    };
  }

  throw new Error('Use a hex, rgb(), rgba(), hsl(), hsla(), or transparent color.');
}

export function serializeThemeColor(value) {
  const { r, g, b, a } = typeof value === 'string' ? parseThemeColor(value) : value;
  if (![r, g, b, a].every(Number.isFinite) || r < 0 || r > 255 || g < 0 || g > 255
    || b < 0 || b > 255 || a < 0 || a > 1) {
    throw new Error('Color channels are outside their valid ranges.');
  }
  const red = Math.round(r);
  const green = Math.round(g);
  const blue = Math.round(b);
  if (a === 1) {
    return `#${[red, green, blue].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
  }
  const alpha = Number(a.toFixed(4)).toString();
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function encodedSize(value) {
  return new TextEncoder().encode(value).byteLength;
}

function validateString(value, name, maximumLength) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  if ([...value].length > maximumLength) {
    throw new Error(`${name} must be at most ${maximumLength} characters.`);
  }
  if (EXTERNAL_URL.test(value)) {
    throw new Error(`${name} must not contain an external URL.`);
  }
  return value.trim();
}

function validateEffects(value) {
  expectRecord(value, 'effects');
  expectKeys(value, EFFECT_FIELDS, 'effects');
  const windowEffect = value.windowEffect ?? 'none';
  if (!['none', 'mica', 'acrylic'].includes(windowEffect)) {
    throw new Error('effects.windowEffect must be none, mica, or acrylic.');
  }
  const panelOpacity = value.panelOpacity ?? 1;
  if (typeof panelOpacity !== 'number' || !Number.isFinite(panelOpacity)
    || panelOpacity < 0 || panelOpacity > 1) {
    throw new Error('effects.panelOpacity must be a finite number between 0 and 1.');
  }
  for (const field of ['textOutline', 'scanlines']) {
    if (value[field] !== undefined && typeof value[field] !== 'boolean') {
      throw new Error(`effects.${field} must be a boolean.`);
    }
  }
  return {
    windowEffect,
    panelOpacity,
    textOutline: value.textOutline ?? false,
    scanlines: value.scanlines ?? false,
  };
}

function validateMeta(value) {
  expectRecord(value, 'meta');
  expectKeys(value, META_FIELDS, 'meta');
  const meta = {};
  if (value.id !== undefined) {
    const id = validateString(value.id, 'meta.id', 60);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      throw new Error('meta.id must contain lowercase letters, numbers, and hyphens.');
    }
    meta.id = id;
  }
  if (value.name !== undefined) meta.name = validateString(value.name, 'meta.name', THEME_NAME_LIMIT);
  if (value.author !== undefined) meta.author = validateString(value.author, 'meta.author', 60);
  if (value.version !== undefined) meta.version = validateString(value.version, 'meta.version', 32);
  if (value.license !== undefined) meta.license = validateString(value.license, 'meta.license', 60);
  if (value.description !== undefined) meta.description = validateString(value.description, 'meta.description', 240);
  return meta;
}

export function validateTheme(value) {
  expectRecord(value, 'Theme');
  expectKeys(value, THEME_FIELDS, 'theme');
  if (value.schemaVersion !== THEME_SCHEMA_VERSION) {
    throw new Error(`schemaVersion must be ${THEME_SCHEMA_VERSION}.`);
  }

  const normalized = { schemaVersion: THEME_SCHEMA_VERSION };
  for (const field of REQUIRED_COLORS) {
    if (value[field] === undefined) throw new Error(`Missing required color "${field}".`);
  }
  for (const field of [...REQUIRED_COLORS, ...OPTIONAL_COLORS]) {
    if (value[field] !== undefined) {
      try {
        normalized[field] = serializeThemeColor(value[field]);
      } catch (error) {
        throw new Error(`Invalid ${field} color: ${error.message}`);
      }
    }
  }

  if (value.font !== undefined) {
    if (!['pixel', 'readable', 'mono'].includes(value.font)) {
      throw new Error('font must be pixel, readable, or mono.');
    }
    normalized.font = value.font;
  }
  if (value.borderWidth !== undefined) {
    if (!Number.isInteger(value.borderWidth) || value.borderWidth < 2 || value.borderWidth > 4) {
      throw new Error('borderWidth must be an integer between 2 and 4.');
    }
    normalized.borderWidth = value.borderWidth;
  }
  if (value.cornerStyle !== undefined) {
    if (!['hard', 'soft'].includes(value.cornerStyle)) {
      throw new Error('cornerStyle must be hard or soft.');
    }
    normalized.cornerStyle = value.cornerStyle;
  }
  if (value.shadowStyle !== undefined) {
    if (!['hard', 'none'].includes(value.shadowStyle)) {
      throw new Error('shadowStyle must be hard or none.');
    }
    normalized.shadowStyle = value.shadowStyle;
  }
  if (value.effects !== undefined) normalized.effects = validateEffects(value.effects);
  if (value.background !== undefined) {
    const background = validateString(value.background, 'background', 80);
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(background)) {
      throw new Error('background must be a safe local asset id.');
    }
    normalized.background = background;
  }
  if (value.stickers !== undefined) {
    if (!Array.isArray(value.stickers) || value.stickers.length > 12
      || value.stickers.some((assetId) => typeof assetId !== 'string'
        || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(assetId))) {
      throw new Error('stickers must be an array of at most 12 safe asset ids.');
    }
    if (new Set(value.stickers).size !== value.stickers.length) {
      throw new Error('stickers must not contain duplicate asset ids.');
    }
    normalized.stickers = [...value.stickers];
  }
  if (value.meta !== undefined) normalized.meta = validateMeta(value.meta);

  if (encodedSize(JSON.stringify(normalized)) > THEME_FILE_LIMIT_BYTES) {
    throw new Error(`Theme file exceeds the ${THEME_FILE_LIMIT_BYTES}-byte limit.`);
  }
  return normalized;
}

export function parseThemeFile(text) {
  if (typeof text !== 'string') throw new Error('Theme file contents must be text.');
  if (encodedSize(text) > THEME_FILE_LIMIT_BYTES) {
    throw new Error(`Theme file exceeds the ${THEME_FILE_LIMIT_BYTES}-byte limit.`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Theme file is not valid JSON: ${error.message}`);
  }
  return validateTheme(parsed);
}

export function serializeThemeFile(theme) {
  return `${JSON.stringify(validateTheme(theme), null, 2)}\n`;
}

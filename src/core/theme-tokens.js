import { parseThemeColor, serializeThemeColor } from './theme.js';

function blend(colorValue, target, amount) {
  const color = parseThemeColor(colorValue);
  const destination = typeof target === 'string' ? parseThemeColor(target) : target;
  return serializeThemeColor({
    r: color.r + (destination.r - color.r) * amount,
    g: color.g + (destination.g - color.g) * amount,
    b: color.b + (destination.b - color.b) * amount,
    a: color.a,
  });
}

function rgba(colorValue, opacity) {
  const color = parseThemeColor(colorValue);
  return serializeThemeColor({ ...color, a: color.a * opacity });
}

export function resolveThemeTokens(theme, overrides = {}) {
  const color = (key) => overrides[key] ?? theme[key];
  const ink = color('ink');
  const wall = color('wall');
  const drawer = color('drawer');
  const edge = color('edge');
  const accent = color('accent');
  const font = overrides.font ?? theme.font;
  const luminance = (value) => {
    const channel = (component) => {
      const normalized = component / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    const parsed = parseThemeColor(value);
    return 0.2126 * channel(parsed.r) + 0.7152 * channel(parsed.g) + 0.0722 * channel(parsed.b);
  };
  const darkBackground = luminance(color('bg')) < 0.179;
  const accentInk = luminance(accent) > 0.179 ? '#000000' : '#ffffff';
  const opacity = theme.effects?.panelOpacity ?? 1;
  const forceSolid = overrides.forceSolid === true;
  const opaque = (value) => serializeThemeColor({ ...parseThemeColor(value), a: 1 });
  const surface = (value, amount) => forceSolid ? opaque(value) : rgba(value, amount);
  const tokens = {
    '--bg': theme.meta?.id === 'transparent'
      ? (forceSolid ? '#f7f9fb' : 'rgba(0, 0, 0, 0)')
      : theme.effects?.windowEffect && theme.effects.windowEffect !== 'none' && !forceSolid
        ? rgba(color('bg'), 0.12)
        : color('bg'),
    '--theme-fallback-bg': opaque(color('bg')),
    '--wall': forceSolid ? opaque(wall) : wall,
    '--desk': forceSolid ? opaque(color('desk')) : color('desk'),
    '--desk-edge': blend(edge, darkBackground ? { r: 0, g: 0, b: 0 } : { r: 0, g: 0, b: 0 }, 0.18),
    '--drawer': forceSolid ? opaque(drawer) : drawer,
    '--drawer-edge': edge,
    '--surface': forceSolid ? opaque(wall) : theme.meta?.id === 'cozy'
      ? blend(wall, { r: 255, g: 255, b: 255 }, 0.45)
      : theme.meta?.id === 'night'
        ? blend(wall, { r: 255, g: 255, b: 255 }, 0.06)
        : surface(wall, opacity),
    '--ink': ink,
    '--muted': color('inkMuted') ?? color('inkSecondary') ?? blend(ink, wall, 0.3),
    '--ink-secondary': color('inkSecondary') ?? color('inkMuted') ?? blend(ink, wall, 0.2),
    '--accent': accent,
    '--accent-ink': accentInk,
    '--buddy': color('buddy'),
    '--glow': rgba(accent, theme.meta?.id === 'night' ? 0.18 : 0.1),
    '--edge': edge,
    '--hover': blend(drawer, darkBackground ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 }, 0.08),
    '--pressed': blend(drawer, darkBackground ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 }, 0.14),
    '--focus-ring': accent,
    '--selection': rgba(accent, 0.24),
    '--disabled': rgba(ink, 0.42),
    '--danger': color('danger') ?? '#c83856',
    '--success': color('success') ?? '#217a42',
    '--warning': color('warning') ?? accent,
    '--text-outline': theme.effects?.textOutline ? `0 1px 2px ${darkBackground ? '#000000' : '#ffffff'}` : 'none',
    '--focus-halo-dark': '#000000',
    '--focus-halo-light': '#ffffff',
    '--shadow-color': 'rgba(0, 0, 0, 0.24)',
    '--scrim': 'rgba(22, 18, 40, 0.55)',
    '--font': font === 'readable'
      ? 'Segoe UI, Arial, sans-serif'
      : font === 'mono'
        ? 'ui-monospace, Menlo, Consolas, monospace'
        : "'Pixelify Sans', ui-monospace, Menlo, Consolas, monospace",
    '--theme-border-width': `${theme.borderWidth ?? 3}px`,
    '--theme-radius': theme.cornerStyle === 'soft' ? '8px' : '0px',
    '--theme-shadow': theme.shadowStyle === 'none' ? 'none' : '5px 5px 0 var(--ink)',
    '--theme-shadow-small': theme.shadowStyle === 'none' ? 'none' : '3px 3px 0 var(--ink)',
  };
  return tokens;
}

export function applyThemeTokens(style, theme, overrides = {}) {
  const tokens = resolveThemeTokens(theme, overrides);
  for (const [name, value] of Object.entries(tokens)) style.setProperty(name, value);
  return tokens;
}

import { parseThemeColor, serializeThemeColor } from './theme.js';

export const THEME_CONTRAST_BACKDROPS = Object.freeze([
  '#ffffff',
  '#000000',
  '#808080',
]);

function composite(foreground, background) {
  const alpha = foreground.a + background.a * (1 - foreground.a);
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
    g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
    b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
    a: alpha,
  };
}

function relativeLuminance(color) {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

export function contrastRatio(foregroundValue, backgroundValue, backdropValue = '#ffffff') {
  const backdrop = parseThemeColor(backdropValue);
  const background = composite(parseThemeColor(backgroundValue), backdrop);
  const foreground = composite(parseThemeColor(foregroundValue), background);
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function pairRatios(foreground, background, backdropValues) {
  return backdropValues.map((backdrop) => ({
    backdrop,
    ratio: contrastRatio(foreground, background, backdrop),
  }));
}

function checkPair(theme, id, foregroundKey, backgroundKey, minimum, text = false) {
  const foreground = theme[foregroundKey];
  const background = theme[backgroundKey];
  const backdrops = foreground.includes('rgba(') || background.includes('rgba(')
    || foreground === 'rgba(0, 0, 0, 0)' || background === 'rgba(0, 0, 0, 0)'
    ? THEME_CONTRAST_BACKDROPS
    : ['#ffffff'];
  const results = pairRatios(foreground, background, backdrops);
  const ratioPassed = results.every(({ ratio }) => ratio >= minimum);
  const outlineAllowed = text
    && ['transparent', 'frost'].includes(theme.meta?.id)
    && theme.effects?.textOutline === true;
  return {
    id,
    foreground: foregroundKey,
    background: backgroundKey,
    minimum,
    ratio: Math.min(...results.map(({ ratio }) => ratio)),
    passed: ratioPassed || outlineAllowed,
    outlined: !ratioPassed && outlineAllowed,
    results,
  };
}

function checkFocusPair(theme, id, backgroundKey) {
  const background = theme[backgroundKey];
  const backdrops = theme.meta?.id === 'transparent' || theme.meta?.id === 'frost'
    ? THEME_CONTRAST_BACKDROPS
    : ['#ffffff'];
  const results = backdrops.map((backdrop) => {
    const darkRing = contrastRatio('#000000', background, backdrop);
    const lightRing = contrastRatio('#ffffff', background, backdrop);
    return { backdrop, ratio: Math.max(darkRing, lightRing), darkRing, lightRing };
  });
  return {
    id,
    foreground: 'focusRing',
    background: backgroundKey,
    minimum: 3,
    ratio: Math.min(...results.map(({ ratio }) => ratio)),
    passed: results.every(({ ratio }) => ratio >= 3),
    outlined: true,
    results,
  };
}

export function checkThemeContrast(theme) {
  const normalized = {
    ...theme,
    inkSecondary: theme.inkSecondary ?? theme.inkMuted ?? theme.ink,
  };
  const checks = [
    checkPair(normalized, 'ink-wall', 'ink', 'wall', 4.5, true),
    checkPair(normalized, 'ink-drawer', 'ink', 'drawer', 4.5, true),
    checkPair(normalized, 'ink-desk', 'ink', 'desk', 4.5, true),
    checkPair(normalized, 'accent-wall', 'accent', 'wall', 4.5, ['transparent', 'frost'].includes(theme.meta?.id)),
    checkPair(normalized, 'accent-drawer', 'accent', 'drawer', 4.5, ['transparent', 'frost'].includes(theme.meta?.id)),
    checkPair(normalized, 'secondary-wall', 'inkSecondary', 'wall', 4.5, true),
    checkPair(normalized, 'edge-background', 'edge', 'bg', 3),
    checkFocusPair(normalized, 'focus-wall', 'wall'),
    checkFocusPair(normalized, 'focus-drawer', 'drawer'),
  ];
  return { passed: checks.every((check) => check.passed), checks };
}

function interpolate(color, target, amount) {
  return {
    r: color.r + (target.r - color.r) * amount,
    g: color.g + (target.g - color.g) * amount,
    b: color.b + (target.b - color.b) * amount,
    a: color.a,
  };
}

function textPasses(theme, field, candidates) {
  if (['transparent', 'frost'].includes(theme.meta?.id)
    && theme.effects?.textOutline === true) return true;
  return candidates.every(([background, minimum]) => {
    const color = serializeThemeColor(theme[field]);
    const backgroundColor = theme[background];
    const backdrops = color.includes('rgba(') || backgroundColor.includes('rgba(')
      || color === 'rgba(0, 0, 0, 0)' || backgroundColor === 'rgba(0, 0, 0, 0)'
      ? THEME_CONTRAST_BACKDROPS
      : ['#ffffff'];
    return backdrops.every((backdrop) =>
      contrastRatio(color, theme[background], backdrop) >= minimum);
  });
}

export function fixThemeTextContrast(theme) {
  const fixed = structuredClone(theme);
  const changes = [];
  const textTargets = [
    ['ink', [['wall', 4.5], ['drawer', 4.5], ['desk', 4.5]]],
    ['inkSecondary', [['wall', 4.5]]],
  ];
  if (!fixed.inkSecondary) fixed.inkSecondary = fixed.inkMuted ?? fixed.ink;

  for (const [field, candidates] of textTargets) {
    if (textPasses(fixed, field, candidates)) continue;
    const original = fixed[field];
    const source = parseThemeColor(original);
    const options = [
      { name: 'black', color: { r: 0, g: 0, b: 0, a: source.a } },
      { name: 'white', color: { r: 255, g: 255, b: 255, a: source.a } },
    ].sort((left, right) =>
      contrastRatio(serializeThemeColor(left.color), fixed.wall)
      - contrastRatio(serializeThemeColor(right.color), fixed.wall));
    options.reverse();
    let replacement = null;
    for (const option of options) {
      for (let step = 1; step <= 100; step += 1) {
        const candidate = serializeThemeColor(interpolate(source, option.color, step / 100));
        fixed[field] = candidate;
        if (textPasses(fixed, field, candidates)) {
          replacement = candidate;
          break;
        }
      }
      if (replacement) break;
    }
    if (replacement) {
      changes.push({ field, from: original, to: replacement });
    } else {
      fixed[field] = original;
    }
  }
  return { theme: fixed, changes };
}

export function fixThemeContrast(theme) {
  const textResult = fixThemeTextContrast(theme);
  const fixed = textResult.theme;
  const changes = [...textResult.changes];
  for (const field of ['accent', 'edge']) {
    const failed = checkThemeContrast(fixed).checks.filter((check) =>
      check.foreground === field && !check.passed);
    if (failed.length === 0) continue;
    const source = parseThemeColor(fixed[field]);
    let replacement = null;
    for (const target of [
      { r: 0, g: 0, b: 0, a: source.a },
      { r: 255, g: 255, b: 255, a: source.a },
    ]) {
      for (let step = 1; step <= 1000; step += 1) {
        const amount = step / 1000;
        const candidate = serializeThemeColor(interpolate(source, target, amount));
        const passes = failed.every((check) => check.results.every(({ backdrop }) =>
          contrastRatio(candidate, fixed[check.background], backdrop) >= check.minimum));
        if (passes) {
          replacement = candidate;
          break;
        }
      }
      if (replacement) break;
    }
    if (replacement) {
      changes.push({ field, from: fixed[field], to: replacement });
      fixed[field] = replacement;
    } else if (!(['transparent', 'frost'].includes(fixed.meta?.id)
      && fixed.effects?.textOutline === true)) {
      changes.push({ field, from: fixed[field], to: null, unresolved: true });
    }
  }
  return { theme: fixed, changes };
}

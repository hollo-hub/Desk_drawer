const CLASSIC_THEME_IDS = Object.freeze({
  'high-contrast': 'highcontrast',
  'savanna-dusk': 'savanna',
});

export function resolveHomeThemeId(themeId) {
  if (typeof themeId !== 'string' || themeId.length === 0) return 'night';
  return CLASSIC_THEME_IDS[themeId] ?? themeId;
}

export function themePaletteEntries(themes) {
  return themes.map((theme) => ({
    id: `action-theme-${theme.meta.id}`,
    name: `Theme: ${theme.meta.name ?? theme.meta.id}`,
    description: `Apply the ${theme.meta.name ?? theme.meta.id} theme.`,
    target: `theme:${theme.meta.id}`,
  }));
}

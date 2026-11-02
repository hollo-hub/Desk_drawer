import cozy from './cozy.json' with { type: 'json' };
import night from './night.json' with { type: 'json' };
import transparent from './transparent.json' with { type: 'json' };
import frost from './frost.json' with { type: 'json' };
import paper from './paper.json' with { type: 'json' };
import arcade from './arcade.json' with { type: 'json' };
import forest from './forest.json' with { type: 'json' };
import savannaDusk from './savanna-dusk.json' with { type: 'json' };
import terminal from './terminal.json' with { type: 'json' };
import highContrast from './high-contrast.json' with { type: 'json' };
import { validateTheme } from '../core/theme.js';

const themeFiles = [
  cozy,
  night,
  transparent,
  frost,
  paper,
  arcade,
  forest,
  savannaDusk,
  terminal,
  highContrast,
];

export function loadBuiltinThemes() {
  return themeFiles.map((theme) => validateTheme(theme));
}

export const BUILTIN_THEME_IDS = Object.freeze(themeFiles.map((theme) => theme.meta.id));

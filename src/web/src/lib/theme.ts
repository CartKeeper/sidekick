export type ThemeId = 'aurora' | 'mono' | 'iris';

export const THEMES: { id: ThemeId; name: string; tagline: string; swatch: string }[] = [
  { id: 'aurora', name: 'Aurora Glow', tagline: 'Glassy depth · cyan glow', swatch: 'linear-gradient(90deg,#22d3ee,#38bdf8)' },
  { id: 'mono', name: 'Electric Mono', tagline: 'Monochrome · one electric accent', swatch: '#d4f74a' },
  { id: 'iris', name: 'Iridescent', tagline: 'Violet→magenta gradient identity', swatch: 'linear-gradient(90deg,#d946ef,#8b5cf6,#6366f1)' },
];

export const DEFAULT_THEME: ThemeId = 'aurora';
const KEY = 'sidekick-theme';

export function getStoredTheme(): ThemeId {
  try {
    const v = localStorage.getItem(KEY) as ThemeId | null;
    if (v && THEMES.some((t) => t.id === v)) return v;
  } catch { /* ignore */ }
  return DEFAULT_THEME;
}

export function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id;
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
}

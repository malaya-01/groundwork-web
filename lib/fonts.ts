// Handwriting fonts from Google Fonts. `scale` evens out their very different natural sizes.
export const HAND_FONTS: { name: string; scale: number }[] = [
  { name: 'Caveat', scale: 1.3 },
  { name: 'Patrick Hand', scale: 1.12 },
  { name: 'Kalam', scale: 1.05 },
  { name: 'Indie Flower', scale: 1.1 },
  { name: 'Shadows Into Light', scale: 1.2 },
  { name: 'Gloria Hallelujah', scale: 0.95 },
  { name: 'Architects Daughter', scale: 1.02 },
  { name: 'Gochi Hand', scale: 1.15 },
  { name: 'Handlee', scale: 1.05 },
  { name: 'Nanum Pen Script', scale: 1.45 },
  { name: 'Reenie Beanie', scale: 1.45 },
  { name: 'Homemade Apple', scale: 0.88 },
  { name: 'Coming Soon', scale: 1.0 },
  { name: 'Dancing Script', scale: 1.18 },
  { name: 'Covered By Your Grace', scale: 1.3 },
  { name: 'Just Another Hand', scale: 1.45 },
];

export const DEFAULT_FONT = 'Caveat';

export const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?' + HAND_FONTS.map((f) => `family=${f.name.replace(/ /g, '+')}`).join('&') + '&display=swap';

/** Fonts offered inside the notes editor: every handwriting font plus a few plain ones. */
export const EDITOR_FONTS: { label: string; css: string }[] = [
  ...HAND_FONTS.map((f) => ({ label: f.name, css: `"${f.name}", cursive` })),
  { label: 'Sans (Inter / system)', css: 'ui-sans-serif, system-ui, "Segoe UI", sans-serif' },
  { label: 'Serif (Georgia)', css: 'Georgia, "Times New Roman", serif' },
  { label: 'Monospace (code)', css: 'ui-monospace, Consolas, "Courier New", monospace' },
];

export function applyHandFont(name: string) {
  if (typeof document === 'undefined') return;
  const f = HAND_FONTS.find((x) => x.name === name) ?? HAND_FONTS[0];
  const root = document.documentElement;
  root.style.setProperty('--hand-font', `"${f.name}"`);
  root.style.setProperty('--hand-scale', String(f.scale));
  try {
    localStorage.setItem('gw.font', f.name);
  } catch {
    /* private mode: fine */
  }
}

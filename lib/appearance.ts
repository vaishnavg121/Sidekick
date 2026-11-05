export interface Appearance {
  version: 1;
  mode: 'dark' | 'light' | 'system';
  base: string;
  accent: string;
  secondary: string;
  contrast: number;
  surfaceOpacity: number;
  borderOpacity: number;
  shadow: number;
  transparency: number;
  blur: number;
  grain: number;
  softness: number;
  radius: number;
  density: number;
  motion: number;
  gradient: {
    type: 'solid' | 'linear' | 'radial';
    angle: number;
    x: number;
    y: number;
    intensity: number;
    stops: { color: string; position: number }[];
  };
}
export interface AppearancePreferences {
  global?: Appearance;
  workspaces?: Record<string, Appearance>;
}
const dark: Appearance = {
  version: 1,
  mode: 'dark',
  base: '#191c21',
  accent: '#93b5d7',
  secondary: '#ada9c6',
  contrast: 100,
  surfaceOpacity: 6,
  borderOpacity: 12,
  shadow: 30,
  transparency: 100,
  blur: 0,
  grain: 0,
  softness: 2,
  radius: 8,
  density: 100,
  motion: 100,
  gradient: {
    type: 'solid',
    angle: 135,
    x: 30,
    y: 10,
    intensity: 12,
    stops: [
      { color: '#6c89a7', position: 0 },
      { color: '#7e7295', position: 100 },
    ],
  },
};
export const APPEARANCE_PRESETS: Record<string, Appearance> = {
  'Minimal Dark': dark,
  'Minimal Light': {
    ...dark,
    mode: 'light',
    base: '#f5f5f2',
    accent: '#315e85',
    secondary: '#665479',
    surfaceOpacity: 75,
    shadow: 12,
  },
  Graphite: {
    ...dark,
    base: '#232425',
    accent: '#c3c8ce',
    secondary: '#959ba4',
    borderOpacity: 9,
  },
  'Warm Neutral': {
    ...dark,
    mode: 'light',
    base: '#f1ece4',
    accent: '#805a3b',
    secondary: '#71634b',
    surfaceOpacity: 65,
    shadow: 10,
  },
  'Deep Ocean': {
    ...dark,
    base: '#12232e',
    accent: '#8bc9d2',
    secondary: '#7da7cc',
    gradient: {
      ...dark.gradient,
      type: 'linear',
      stops: [
        { color: '#1c6875', position: 0 },
        { color: '#19334d', position: 100 },
      ],
    },
  },
  'Soft Lavender': {
    ...dark,
    mode: 'light',
    base: '#f0eef6',
    accent: '#65538c',
    secondary: '#677fa1',
    gradient: { ...dark.gradient, type: 'radial', intensity: 8 },
  },
  'Frosted Glass': {
    ...dark,
    base: '#20262d',
    accent: '#b6c8da',
    transparency: 88,
    blur: 16,
    grain: 2,
    surfaceOpacity: 7,
  },
};
export const cloneAppearance = (a: Appearance) => structuredClone(a);
export function defaultAppearance(light = false): Appearance {
  return cloneAppearance(
    APPEARANCE_PRESETS[light ? 'Minimal Light' : 'Minimal Dark']!,
  );
}
export function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const range = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export function isAppearance(v: unknown): v is Appearance {
  if (
    !record(v) ||
    Object.keys(v).some((k) => !Object.prototype.hasOwnProperty.call(dark, k))
  )
    return false;
  if (
    v.version !== 1 ||
    !['dark', 'light', 'system'].includes(String(v.mode)) ||
    ![v.base, v.accent, v.secondary].every(isHex)
  )
    return false;
  const bounds: Record<string, [number, number]> = {
    contrast: [85, 100],
    surfaceOpacity: [0, 100],
    borderOpacity: [0, 40],
    shadow: [0, 80],
    transparency: [85, 100],
    blur: [0, 24],
    grain: [0, 6],
    softness: [0, 8],
    radius: [2, 16],
    density: [85, 115],
    motion: [0, 150],
  };
  if (Object.entries(bounds).some(([k, [min, max]]) => !range(v[k], min, max)))
    return false;
  const g = v.gradient;
  return (
    record(g) &&
    Object.keys(g).every((k) =>
      ['type', 'angle', 'x', 'y', 'intensity', 'stops'].includes(k),
    ) &&
    ['solid', 'linear', 'radial'].includes(String(g.type)) &&
    range(g.angle, 0, 360) &&
    range(g.x, 0, 100) &&
    range(g.y, 0, 100) &&
    range(g.intensity, 0, 40) &&
    Array.isArray(g.stops) &&
    g.stops.length >= 2 &&
    g.stops.length <= 5 &&
    g.stops.every(
      (s) =>
        record(s) &&
        Object.keys(s).every((k) => ['color', 'position'].includes(k)) &&
        isHex(s.color) &&
        range(s.position, 0, 100),
    )
  );
}
export function isAppearancePreferences(
  v: unknown,
  workspaceIds: string[],
): v is AppearancePreferences {
  return (
    record(v) &&
    Object.keys(v).every((k) => ['global', 'workspaces'].includes(k)) &&
    (v.global === undefined || isAppearance(v.global)) &&
    (v.workspaces === undefined ||
      (record(v.workspaces) &&
        Object.entries(v.workspaces).every(
          ([id, a]) => workspaceIds.includes(id) && isAppearance(a),
        )))
  );
}
export function parseTheme(text: string): Appearance {
  if (text.length > 20000) throw Error('Theme file exceeds 20 KB.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw Error('Theme file is not valid JSON.');
  }
  if (
    !record(value) ||
    value.format !== 'sidekick-theme' ||
    !isAppearance(value.appearance)
  )
    throw Error(
      'Invalid theme. Only validated Sidekick colors and controls are accepted.',
    );
  return cloneAppearance(value.appearance);
}
export function exportTheme(appearance: Appearance): string {
  if (!isAppearance(appearance)) throw Error('Invalid theme.');
  return JSON.stringify({ format: 'sidekick-theme', appearance }, null, 2);
}
export function hexToHsv(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
  ) as [number, number, number];
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  const h =
    d === 0
      ? 0
      : max === r
        ? ((g - b) / d) % 6
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? (d / max) * 100 : 0, max * 100];
}
export function hsvToHex(h: number, s: number, v: number): string {
  s /= 100;
  v /= 100;
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return '#' + f(5) + f(3) + f(1);
}
function luminance(hex: string) {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}
export function contrastRatio(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function composite(front: string, back: string, alpha: number) {
  return (
    '#' +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          parseInt(front.slice(i, i + 2), 16) * alpha +
            parseInt(back.slice(i, i + 2), 16) * (1 - alpha),
        )
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
/** Bound decoration against both light/dark pages and the opaque input surfaces. */
function safeEffects(a: Appearance, light: boolean) {
  let scale = 1,
    backgrounds = [a.base],
    fallback = '#ffffff';
  for (let attempt = 0; attempt < 20; attempt++) {
    const opacity = 1 - (1 - a.transparency / 100) * scale;
    const panel = ['#000000', '#ffffff'].map((web) =>
      composite(a.base, web, opacity),
    );
    const gradient =
      a.gradient.type === 'solid' ? 0 : (a.gradient.intensity / 100) * scale;
    const surface =
      ((light ? a.surfaceOpacity : a.surfaceOpacity * 0.14) / 100) * scale;
    const grain = (a.grain / 100) * scale;
    backgrounds = [
      a.base,
      ...panel
        .flatMap((bg) => [
          bg,
          ...a.gradient.stops.map((stop) =>
            composite(stop.color, bg, gradient),
          ),
        ])
        .flatMap((bg) => [bg, composite('#ffffff', bg, surface)])
        .flatMap((bg) => [
          bg,
          composite('#ffffff', bg, grain),
          composite('#000000', bg, grain),
        ]),
    ];
    const min = (color: string) =>
      Math.min(...backgrounds.map((bg) => contrastRatio(color, bg)));
    fallback = min('#ffffff') > min('#000000') ? '#ffffff' : '#000000';
    if (min(fallback) >= 4.5) return { scale, opacity, backgrounds, fallback };
    scale = attempt === 18 ? 0 : scale * 0.7;
  }
  return { scale: 0, opacity: 1, backgrounds: [a.base], fallback };
}
export function appearanceVariables(a: Appearance): Record<string, string> {
  const light = luminance(a.base) > 0.3;
  const effects = safeEffects(a, light);
  const readable = (color: string) =>
    effects.backgrounds.every((bg) => contrastRatio(color, bg) >= 4.5)
      ? color
      : effects.fallback;
  const primary = light ? '#202327' : '#f2f4f7';
  const blend =
    '#' +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          (parseInt(primary.slice(i, i + 2), 16) * a.contrast) / 100 +
            parseInt(a.base.slice(i, i + 2), 16) * (1 - a.contrast / 100),
        )
          .toString(16)
          .padStart(2, '0'),
      )
      .join('');
  const text = readable(blend),
    muted = readable(light ? '#5a6067' : '#a9b1bc');
  const rgb = (hex: string, opacity: number) =>
    `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ')} / ${opacity / 100})`;
  const stops = [...a.gradient.stops]
    .sort((x, y) => x.position - y.position)
    .map(
      (s) =>
        `${rgb(s.color, a.gradient.intensity * effects.scale)} ${s.position}%`,
    )
    .join(', ');
  return {
    '--sk-bg': a.base,
    '--sk-panel-bg': rgb(a.base, effects.opacity * 100),
    '--sk-text': text,
    '--sk-muted': muted,
    '--sk-accent': readable(a.accent),
    '--sk-accent-raw': a.accent,
    '--sk-secondary': readable(a.secondary),
    '--sk-surface': rgb(
      light ? '#ffffff' : '#ffffff',
      (light ? a.surfaceOpacity : a.surfaceOpacity * 0.14) * effects.scale,
    ),
    '--sk-hover': rgb(light ? '#000000' : '#ffffff', light ? 5 : 7),
    '--sk-border': rgb(light ? '#111111' : '#ffffff', a.borderOpacity),
    '--sk-shadow': `0 12px 40px rgb(0 0 0 / ${a.shadow / 100})`,
    '--sk-radius': `${a.radius}px`,
    '--sk-row-height': `${Math.round((34 * a.density) / 100)}px`,
    '--sk-space': `${Math.round((8 * a.density) / 100)}px`,
    '--sk-duration': `${Math.round((160 * a.motion) / 100)}ms`,
    '--sk-panel-duration': `${Math.round((210 * a.motion) / 100)}ms`,
    '--sk-ease': 'cubic-bezier(.2,.7,.2,1)',
    '--sk-blur': `${a.blur}px`,
    '--sk-backdrop': a.blur ? `blur(${a.blur}px)` : 'none',
    '--sk-overlay-backdrop': a.blur ? `blur(${Math.min(6, a.blur)}px)` : 'none',
    '--sk-softness': `${a.softness}px`,
    '--sk-grain': String((a.grain / 100) * effects.scale),
    '--sk-contrast': String(a.contrast / 100),
    '--sk-gradient':
      a.gradient.type === 'solid'
        ? 'none'
        : a.gradient.type === 'linear'
          ? `linear-gradient(${a.gradient.angle}deg, ${stops})`
          : `radial-gradient(ellipse at ${a.gradient.x}% ${a.gradient.y}%, ${stops})`,
    'color-scheme': light ? 'light' : 'dark',
  };
}

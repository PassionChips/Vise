// Design tokens. Structure and names follow the Figma "VISE — Design System" file
// (e.g. `color.content.primary` ↔ Content/Primary); the values are the dark-first
// "glass" look: deep green-black surfaces, emerald accent, translucent cards.
// Every colour in the app comes from here, in a Light and a Dark palette with the same keys.

import { StyleSheet, type TextStyle } from 'react-native';

export type ColorScheme = 'light' | 'dark';

const light = {
  brand: { primary: '#047857', pressed: '#065f46', subtle: '#e3f5ec' },
  surface: { background: '#eef3f0', default: '#ffffff', variant: '#e4ebe7' },
  content: { primary: '#0f1a14', secondary: '#5b6862', disabled: '#a3aea8', onBrand: '#ffffff' },
  border: { default: '#dde5e0', focus: '#047857' },
  feedback: {
    success: '#047857',
    successSubtle: '#e3f5ec',
    warning: '#b45309',
    warningSubtle: '#fdf1de',
    error: '#c0322a',
    errorSubtle: '#fce9e7',
    info: '#0f766e',
    infoSubtle: '#dff3f0',
  },
  finance: {
    remaining: '#047857',
    spending: '#0f1a14',
    underBudget: '#047857',
    overBudget: '#c0322a',
    predicted: '#0f766e',
  },
  overlay: { scrim: 'rgba(10, 18, 14, 0.48)' },
  /** Translucent "glass" containers: cards, the tab bar and sheets. */
  glass: {
    /** Card fill over the blur. */
    fill: 'rgba(255, 255, 255, 0.68)',
    /** Tab bar and sheets: more opaque so text over busy content stays readable. */
    fillStrong: 'rgba(255, 255, 255, 0.86)',
    border: 'rgba(15, 26, 20, 0.08)',
    /** 1px light edge along the top of a glass container. */
    highlight: 'rgba(255, 255, 255, 0.95)',
    /** Lift under glass containers. */
    shadow: '0px 8px 24px rgba(15, 26, 20, 0.08)',
    /** Soft brand-coloured glow under primary actions. */
    brandGlow: '0px 6px 18px rgba(4, 120, 87, 0.28)',
    /** expo-blur tint. */
    tint: 'light',
  },
  /** CSS gradients (React Native `experimental_backgroundImage`). */
  gradient: {
    /** Primary buttons. White text stays above 4.5:1 across the whole ramp. */
    brand: 'linear-gradient(135deg, #047857 0%, #0f766e 100%)',
    /** The dashboard's hero balance card. */
    hero: 'linear-gradient(140deg, #047857 0%, #0d7a6b 55%, #115e59 100%)',
    /** Progress fills. */
    progress: 'linear-gradient(90deg, #047857 0%, #0f766e 100%)',
    /** Ambient light behind each screen. */
    ambientPrimary: 'radial-gradient(circle at center, rgba(16, 185, 129, 0.22) 0%, rgba(16, 185, 129, 0) 70%)',
    ambientSecondary: 'radial-gradient(circle at center, rgba(45, 212, 191, 0.18) 0%, rgba(45, 212, 191, 0) 70%)',
    /** Loading placeholders: a soft band that sweeps across. */
    shimmer: 'linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.7) 50%, rgba(255, 255, 255, 0) 100%)',
  },
  /** Text and track on the hero card. */
  hero: { text: '#ffffff', subtext: 'rgba(255, 255, 255, 0.78)', track: 'rgba(255, 255, 255, 0.22)', fill: '#ffffff' },
};

export type Palette = typeof light;

const dark: Palette = {
  brand: { primary: '#34d399', pressed: '#10b981', subtle: 'rgba(52, 211, 153, 0.14)' },
  surface: { background: '#070b09', default: '#111915', variant: '#1a2420' },
  content: { primary: '#eef4f1', secondary: '#9aa8a2', disabled: '#56625d', onBrand: '#03140b' },
  border: { default: 'rgba(255, 255, 255, 0.08)', focus: '#34d399' },
  feedback: {
    success: '#34d399',
    successSubtle: 'rgba(52, 211, 153, 0.14)',
    warning: '#fbbf24',
    warningSubtle: 'rgba(251, 191, 36, 0.14)',
    error: '#f87171',
    errorSubtle: 'rgba(248, 113, 113, 0.14)',
    info: '#2dd4bf',
    infoSubtle: 'rgba(45, 212, 191, 0.14)',
  },
  finance: {
    remaining: '#34d399',
    spending: '#eef4f1',
    underBudget: '#34d399',
    overBudget: '#f87171',
    predicted: '#2dd4bf',
  },
  overlay: { scrim: 'rgba(2, 6, 4, 0.72)' },
  glass: {
    fill: 'rgba(20, 29, 25, 0.58)',
    fillStrong: 'rgba(14, 21, 18, 0.82)',
    border: 'rgba(255, 255, 255, 0.09)',
    highlight: 'rgba(255, 255, 255, 0.12)',
    shadow: '0px 12px 32px rgba(0, 0, 0, 0.45)',
    brandGlow: '0px 6px 22px rgba(52, 211, 153, 0.35)',
    tint: 'dark',
  },
  gradient: {
    brand: 'linear-gradient(135deg, #34d399 0%, #2dd4bf 100%)',
    hero: 'linear-gradient(140deg, rgba(16, 185, 129, 0.55) 0%, rgba(13, 148, 136, 0.32) 50%, rgba(17, 25, 21, 0.35) 100%)',
    progress: 'linear-gradient(90deg, #10b981 0%, #2dd4bf 100%)',
    ambientPrimary: 'radial-gradient(circle at center, rgba(52, 211, 153, 0.26) 0%, rgba(52, 211, 153, 0) 70%)',
    ambientSecondary: 'radial-gradient(circle at center, rgba(45, 212, 191, 0.16) 0%, rgba(45, 212, 191, 0) 70%)',
    shimmer: 'linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.07) 50%, rgba(255, 255, 255, 0) 100%)',
  },
  hero: { text: '#eef4f1', subtext: 'rgba(238, 244, 241, 0.72)', track: 'rgba(255, 255, 255, 0.12)', fill: '#34d399' },
};

export const palettes: Record<ColorScheme, Palette> = { light, dark };

/**
 * The launch screen is always dark (it matches the native splash in app.json, which
 * shows before the theme is known), so its colours don't switch with the theme.
 */
export const launch = {
  background: '#070b09',
  wordmark: '#eef4f1',
  tagline: '#9aa8a2',
  glow: 'radial-gradient(circle at center, rgba(52, 211, 153, 0.38) 0%, rgba(45, 212, 191, 0.12) 45%, rgba(7, 11, 9, 0) 70%)',
} as const;

function copy(palette: Palette): Palette {
  return JSON.parse(JSON.stringify(palette)) as Palette;
}

/**
 * The active palette. Its values are swapped in place by `applyColorScheme`,
 * so code that reads `color.x.y` while rendering always gets the current
 * theme. Never cache a value from it at module level; use `themed` instead.
 */
export const color: Palette = copy(light);

let activeScheme: ColorScheme = 'light';
let paletteVersion = 0;

export const currentColorScheme = () => activeScheme;

/** Switches every token to `scheme`. Cheap and idempotent. */
export function applyColorScheme(scheme: ColorScheme): boolean {
  if (scheme === activeScheme) return false;
  const next = palettes[scheme];
  for (const group of Object.keys(next) as (keyof Palette)[]) {
    Object.assign(color[group], next[group]);
  }
  activeScheme = scheme;
  paletteVersion += 1;
  return true;
}

/**
 * `StyleSheet.create` for styles that use colour tokens. The factory runs
 * again after the theme changes, so a component reading `styles.x` while
 * rendering always gets the current palette.
 */
export function themed<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: () => T & StyleSheet.NamedStyles<any>,
): T {
  let cached: T | undefined;
  let builtFor = -1;
  const current = (): T => {
    if (!cached || builtFor !== paletteVersion) {
      cached = StyleSheet.create(factory());
      builtFor = paletteVersion;
    }
    return cached;
  };
  return new Proxy({} as T, {
    get: (_target, key) => current()[key as keyof T],
    has: (_target, key) => key in (current() as object),
    ownKeys: () => Reflect.ownKeys(current() as object),
    getOwnPropertyDescriptor: (_target, key) => Reflect.getOwnPropertyDescriptor(current() as object, key),
  });
}

export const spacing = { 4: 4, 8: 8, 12: 12, 16: 16, 20: 20, 24: 24, 32: 32, 40: 40, 48: 48, 64: 64 } as const;

/** `card` is the glass container corner: softer than lg so the translucent edge reads as one piece. */
export const radius = { xs: 4, sm: 8, md: 12, lg: 16, card: 20, xl: 24, full: 999 } as const;

/** Micro-interaction timings (ms). Every animation is skipped when the device asks to reduce motion. */
export const motion = {
  /** Pressed controls shrink to this scale... */
  pressScale: 0.97,
  pressIn: 90,
  /** ...and spring back over about this long. */
  pressOut: 180,
  /** Content fading in after a screen or month change. */
  enter: 320,
  /** Delay between items in a staggered entrance. */
  stagger: 55,
  /** Progress bars and the hero balance counting up. */
  fill: 700,
} as const;

export const fontFamily = {
  uiRegular: 'Manrope_400Regular',
  uiMedium: 'Manrope_500Medium',
  uiSemiBold: 'Manrope_600SemiBold',
  uiBold: 'Manrope_700Bold',
  dataMedium: 'IBMPlexMono_500Medium',
  dataSemiBold: 'IBMPlexMono_600SemiBold',
} as const;

// Text styles, named after the Figma text styles. Manrope for words, IBM Plex Mono for money
// (fixed-width digits keep columns of amounts aligned); big figures are tracked tighter.
export const type = {
  displayLarge: { fontFamily: fontFamily.uiBold, fontSize: 40, lineHeight: 48, letterSpacing: -0.8 },
  headingLarge: { fontFamily: fontFamily.uiBold, fontSize: 26, lineHeight: 32, letterSpacing: -0.5 },
  headingMedium: { fontFamily: fontFamily.uiSemiBold, fontSize: 18, lineHeight: 26, letterSpacing: -0.2 },
  bodyLarge: { fontFamily: fontFamily.uiRegular, fontSize: 16, lineHeight: 24 },
  bodyMedium: { fontFamily: fontFamily.uiRegular, fontSize: 14, lineHeight: 20 },
  bodySmall: { fontFamily: fontFamily.uiMedium, fontSize: 12, lineHeight: 16 },
  label: { fontFamily: fontFamily.uiSemiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
  button: { fontFamily: fontFamily.uiSemiBold, fontSize: 16, lineHeight: 20 },
  numericLarge: { fontFamily: fontFamily.dataSemiBold, fontSize: 34, lineHeight: 42, letterSpacing: -1 },
  numericMedium: { fontFamily: fontFamily.dataSemiBold, fontSize: 22, lineHeight: 28, letterSpacing: -0.5 },
  numericSmall: { fontFamily: fontFamily.dataMedium, fontSize: 14, lineHeight: 20 },
} satisfies Record<string, TextStyle>;

// Elevation/SM. boxShadow works on iOS, Android and web; the shadow* props are deprecated on web.
export const elevationSm = {
  boxShadow: '0px 1px 3px rgba(15, 23, 18, 0.06)',
} as const;

// Elevation/MD (menus, raised cards) and Elevation/LG (sheets, dialogs).
export const elevationMd = {
  boxShadow: '0px 4px 12px rgba(15, 23, 18, 0.08)',
} as const;

export const elevationLg = {
  boxShadow: '0px 12px 32px rgba(15, 23, 18, 0.12)',
} as const;

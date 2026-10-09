// Design tokens from the Figma "VISE — Design System" file.
// Names mirror the Figma variables, e.g. `color.content.primary` ↔ Content/Primary.
// Colours come from the "Semantic" collection, which has a Light and a Dark mode.

import { StyleSheet, type TextStyle } from 'react-native';

export type ColorScheme = 'light' | 'dark';

const light = {
  brand: { primary: '#16833b', pressed: '#0b5d2a', subtle: '#f1f9f4' },
  surface: { background: '#f7f9f7', default: '#ffffff', variant: '#f0f3f0' },
  content: { primary: '#17231b', secondary: '#6b756e', disabled: '#a5b0a8', onBrand: '#ffffff' },
  border: { default: '#e3e9e4', focus: '#17231b' },
  feedback: {
    success: '#16833b',
    successSubtle: '#f1f9f4',
    warning: '#b45309',
    warningSubtle: '#fef3e2',
    error: '#c2342b',
    errorSubtle: '#fdecea',
    info: '#159a91',
    infoSubtle: '#e3f5f3',
  },
  finance: {
    remaining: '#16833b',
    spending: '#17231b',
    underBudget: '#16833b',
    overBudget: '#c2342b',
    predicted: '#159a91',
  },
  overlay: { scrim: 'rgba(16, 23, 19, 0.6)' },
  // Frosted surfaces: translucent so what scrolls beneath shows through, with a hairline edge.
  glass: { surface: 'rgba(255, 255, 255, 0.68)', border: 'rgba(23, 35, 27, 0.08)', inner: 'rgba(23, 35, 27, 0.04)' },
  // Calendar day tints. Soft on purpose: a quiet wash that reads at a glance, never an alarm.
  heat: {
    income: 'rgba(22, 131, 59, 0.14)',
    under: 'rgba(22, 131, 59, 0.12)',
    low: 'rgba(194, 52, 43, 0.07)',
    mid: 'rgba(194, 52, 43, 0.13)',
    high: 'rgba(194, 52, 43, 0.22)',
  },
};

export type Palette = typeof light;

const dark: Palette = {
  brand: { primary: '#3dba6a', pressed: '#16833b', subtle: '#12301e' },
  surface: { background: '#101713', default: '#19221c', variant: '#222d25' },
  content: { primary: '#f2f6f2', secondary: '#a5b0a8', disabled: '#6b756e', onBrand: '#101713' },
  border: { default: '#303c33', focus: '#f2f6f2' },
  feedback: {
    success: '#3dba6a',
    successSubtle: '#12301e',
    warning: '#f5b44a',
    warningSubtle: '#3a2a12',
    error: '#f07167',
    errorSubtle: '#3a1a18',
    info: '#3cc4ba',
    infoSubtle: '#10302d',
  },
  finance: {
    remaining: '#3dba6a',
    spending: '#f2f6f2',
    underBudget: '#3dba6a',
    overBudget: '#f07167',
    predicted: '#3cc4ba',
  },
  overlay: { scrim: 'rgba(0, 0, 0, 0.6)' },
  glass: { surface: 'rgba(25, 34, 28, 0.62)', border: 'rgba(255, 255, 255, 0.09)', inner: 'rgba(255, 255, 255, 0.05)' },
  heat: {
    income: 'rgba(61, 186, 106, 0.18)',
    under: 'rgba(61, 186, 106, 0.16)',
    low: 'rgba(240, 113, 103, 0.10)',
    mid: 'rgba(240, 113, 103, 0.18)',
    high: 'rgba(240, 113, 103, 0.28)',
  },
};

export const palettes: Record<ColorScheme, Palette> = { light, dark };

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

export const spacing = { 4: 4, 8: 8, 12: 12, 16: 16, 20: 20, 24: 24 } as const;

export const radius = { sm: 8, md: 12, lg: 16, full: 999 } as const;

export const fontFamily = {
  uiRegular: 'Manrope_400Regular',
  uiMedium: 'Manrope_500Medium',
  uiSemiBold: 'Manrope_600SemiBold',
  uiBold: 'Manrope_700Bold',
  dataMedium: 'IBMPlexMono_500Medium',
  dataSemiBold: 'IBMPlexMono_600SemiBold',
} as const;

// Text styles, named after the Figma text styles.
export const type = {
  displayLarge: { fontFamily: fontFamily.uiBold, fontSize: 40, lineHeight: 48, letterSpacing: -0.4 },
  headingLarge: { fontFamily: fontFamily.uiBold, fontSize: 24, lineHeight: 32, letterSpacing: -0.12 },
  headingMedium: { fontFamily: fontFamily.uiSemiBold, fontSize: 18, lineHeight: 26 },
  bodyLarge: { fontFamily: fontFamily.uiRegular, fontSize: 16, lineHeight: 24 },
  bodyMedium: { fontFamily: fontFamily.uiRegular, fontSize: 14, lineHeight: 20 },
  bodySmall: { fontFamily: fontFamily.uiMedium, fontSize: 12, lineHeight: 16 },
  label: { fontFamily: fontFamily.uiSemiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0.24 },
  button: { fontFamily: fontFamily.uiSemiBold, fontSize: 16, lineHeight: 20 },
  numericLarge: { fontFamily: fontFamily.dataSemiBold, fontSize: 32, lineHeight: 40, letterSpacing: -0.64 },
  numericMedium: { fontFamily: fontFamily.dataSemiBold, fontSize: 20, lineHeight: 28, letterSpacing: -0.2 },
  numericSmall: { fontFamily: fontFamily.dataMedium, fontSize: 14, lineHeight: 20 },
} satisfies Record<string, TextStyle>;

// Elevation/SM. boxShadow works on iOS, Android and web; the shadow* props are deprecated on web.
export const elevationSm = {
  boxShadow: '0px 1px 3px rgba(15, 23, 18, 0.06)',
} as const;

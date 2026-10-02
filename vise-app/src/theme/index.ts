// Design tokens from the "VISE — Design System" Figma file.
// Names mirror the Figma variables (e.g. `--color-content-primary` → colors.contentPrimary)
// so a token can be traced back to the design.

import type { TextStyle } from 'react-native';

export const colors = {
  surfaceBackground: '#f7f9f7',
  surfaceDefault: '#ffffff',
  surfaceVariant: '#f0f3f0',

  contentPrimary: '#17231b',
  contentSecondary: '#6b756e',
  contentDisabled: '#a5b0a8',
  contentOnBrand: '#ffffff',

  brandPrimary: '#16833b',
  brandSubtle: '#f1f9f4',

  feedbackSuccess: '#16833b',
  feedbackSuccessSubtle: '#f1f9f4',
  feedbackError: '#c2342b',

  financeUnderBudget: '#16833b',
  financeRemaining: '#16833b',

  cardFill: '#ffffff',
  cardBorder: '#e3e9e4',

  inputFill: '#ffffff',
  inputBorder: '#e3e9e4',
  inputBorderFocus: '#16833b',
  inputBorderError: '#c2342b',

  progressTrack: '#f0f3f0',

  buttonPrimaryFill: '#16833b',
  buttonPrimaryLabel: '#ffffff',
  buttonTertiaryLabel: '#16833b',
} as const;

export const spacing = {
  4: 4,
  8: 8,
  12: 12,
  16: 16,
  20: 20,
  24: 24,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
} as const;

/** Elevation/SM. */
export const elevationSm = {
  boxShadow: '0px 1px 3px rgba(15, 23, 18, 0.06)',
} as const;

// React Native picks the weight through the font family name, so each
// weight is its own family. These keys must match `fontAssets` below.
const font = {
  uiRegular: 'Manrope_400Regular',
  uiMedium: 'Manrope_500Medium',
  uiSemiBold: 'Manrope_600SemiBold',
  uiBold: 'Manrope_700Bold',
  dataMedium: 'IBMPlexMono_500Medium',
  dataSemiBold: 'IBMPlexMono_600SemiBold',
} as const;

/** Figma letter spacing is a percentage of the font size. */
const tracking = (percent: number, size: number) => (percent / 100) * size;

export const typography = {
  displayLarge: { fontFamily: font.uiBold, fontSize: 40, lineHeight: 48, letterSpacing: tracking(-1, 40) },
  headingLarge: { fontFamily: font.uiBold, fontSize: 24, lineHeight: 32, letterSpacing: tracking(-0.5, 24) },
  headingMedium: { fontFamily: font.uiSemiBold, fontSize: 18, lineHeight: 26 },
  bodyLarge: { fontFamily: font.uiRegular, fontSize: 16, lineHeight: 24 },
  bodyMedium: { fontFamily: font.uiRegular, fontSize: 14, lineHeight: 20 },
  bodySmall: { fontFamily: font.uiMedium, fontSize: 12, lineHeight: 16 },
  label: { fontFamily: font.uiSemiBold, fontSize: 12, lineHeight: 16, letterSpacing: tracking(2, 12) },
  button: { fontFamily: font.uiSemiBold, fontSize: 16, lineHeight: 20 },
  numericMedium: { fontFamily: font.dataSemiBold, fontSize: 20, lineHeight: 28, letterSpacing: tracking(-1, 20) },
  numericSmall: { fontFamily: font.dataMedium, fontSize: 14, lineHeight: 20 },
} satisfies Record<string, TextStyle>;

export { fontAssets } from './fonts';

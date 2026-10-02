// Design tokens from the Figma "VISE — Design System" file (light mode).
// Names mirror the Figma variables, e.g. `color.content.primary` ↔ Content/Primary.

import type { TextStyle } from 'react-native';

export const color = {
  brand: { primary: '#16833b', subtle: '#f1f9f4' },
  surface: { background: '#f7f9f7', default: '#ffffff', variant: '#f0f3f0' },
  content: { primary: '#17231b', secondary: '#6b756e', disabled: '#a5b0a8', onBrand: '#ffffff' },
  border: { default: '#e3e9e4' },
  feedback: {
    success: '#16833b',
    successSubtle: '#f1f9f4',
    warning: '#b45309',
    warningSubtle: '#fef3e2',
    error: '#c2342b',
    errorSubtle: '#fdecea',
    infoSubtle: '#e3f5f3',
  },
  finance: {
    remaining: '#16833b',
    spending: '#17231b',
    underBudget: '#16833b',
    overBudget: '#c2342b',
    predicted: '#159a91',
  },
} as const;

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

// Elevation/SM: 0 1 3 rgba(15,23,18,0.06)
export const elevationSm = {
  shadowColor: '#0f1712',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 1.5,
  elevation: 1,
} as const;

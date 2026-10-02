// Appearance preference rules. Pure, so they can be unit-tested without React Native.

import type { ColorScheme } from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

/** The scheme to show: the forced one, or the device's (light when it has none). */
export function resolveScheme(preference: ThemePreference, device: string | null | undefined): ColorScheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return device === 'dark' ? 'dark' : 'light';
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

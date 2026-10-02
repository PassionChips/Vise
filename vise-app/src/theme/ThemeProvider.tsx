// Light / Dark / System appearance.
//
// The preference is a setting stored by rust-core (`app_settings.theme`),
// so it survives restarts and "Delete all my data" keeps it. "System"
// follows the device and updates live when the device switches.
//
// Every screen calls `useTheme()`; when the scheme changes they re-render
// and read the swapped `color` tokens and `themed` styles.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { useCoreQuery } from '../data/store';
import { getSettings, updateSettings } from '../services/viseCore';
import { isThemePreference, resolveScheme, type ThemePreference } from './preference';
import { applyColorScheme, type ColorScheme } from './tokens';

export { THEME_PREFERENCES, type ThemePreference } from './preference';

interface ThemeContextValue {
  preference: ThemePreference;
  /** The scheme actually shown. */
  scheme: ColorScheme;
  /** What the device asks for; shown as "Follows your device: currently …". */
  deviceScheme: ColorScheme;
  /** Saves the preference through rust-core; rejects (and changes nothing) if saving fails. */
  setPreference: (preference: ThemePreference) => Promise<void>;
  /** True until the saved preference has been read once. */
  loading: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const device = useColorScheme();
  const settings = useCoreQuery(getSettings);
  // Shown while a save is in flight so the switch feels instant; cleared on failure.
  const [pending, setPending] = useState<ThemePreference | null>(null);

  const saved = settings.data?.theme;
  const preference: ThemePreference = pending ?? (isThemePreference(saved) ? saved : 'system');
  const deviceScheme = resolveScheme('system', device);

  // Drop the optimistic value once the stored one has caught up.
  useEffect(() => {
    if (pending && saved === pending) setPending(null);
  }, [pending, saved]);
  const scheme = resolveScheme(preference, device);

  // Swap the tokens before any child renders with them. Idempotent.
  applyColorScheme(scheme);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      scheme,
      deviceScheme,
      loading: settings.loading,
      setPreference: async (next) => {
        setPending(next);
        try {
          await updateSettings({ theme: next });
        } catch (error) {
          setPending(null);
          throw error;
        }
      },
    }),
    [preference, scheme, deviceScheme, settings.loading],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Subscribes the calling component to theme changes. */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}

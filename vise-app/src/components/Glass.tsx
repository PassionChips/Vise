import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, elevationSm, radius, themed } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

/** Turn the real backdrop blur off (translucent fill only) if a device renders it badly. */
const BLUR = true;

interface GlassProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 1 to 100. Kept low: the surface should feel frosted, not smeared. */
  intensity?: number;
}

/**
 * A frosted surface: the content behind it is blurred, a translucent wash keeps text readable, and a hairline
 * edge and soft shadow lift it off the page. Use it for a few layers (a pinned header, a sheet), not everywhere.
 */
export function Glass({ children, style, intensity = 45 }: GlassProps) {
  const { scheme } = useTheme();
  return (
    <View style={[styles.glass, style]}>
      {BLUR && (
        <BlurView
          pointerEvents="none"
          intensity={intensity}
          tint={scheme === 'dark' ? 'dark' : 'light'}
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
      )}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.wash]} />
      {children}
    </View>
  );
}

const styles = themed(() => ({
  glass: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.glass.border,
    ...elevationSm,
  },
  wash: { backgroundColor: color.glass.surface },
}));

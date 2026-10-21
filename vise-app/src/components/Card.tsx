import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { color, radius, spacing, themed } from '../theme/tokens';
import { GlassSurface } from './Glass';

interface Props {
  children: ReactNode;
  /** Predicted figures use a dashed border so they never read as real numbers. */
  dashed?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Glass card: blurred translucent fill, hairline border, Radius/Card, 20px padding by default. */
export function Card({ children, dashed, style }: Props) {
  return (
    <GlassSurface style={[styles.card, style]}>
      {/* A dashed border can't share the glass hairline, so it is drawn on top. */}
      {dashed && <View pointerEvents="none" style={styles.dashed} />}
      {children}
    </GlassSurface>
  );
}

const styles = themed(() => ({
  card: { padding: spacing[20] },
  dashed: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.card - 1,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.content.disabled,
  },
}));

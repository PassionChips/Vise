import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, radius, spacing } from '../theme/tokens';

interface Props {
  children: ReactNode;
  /** Predicted figures use a dashed border so they never read as real numbers. */
  dashed?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Card fill + 1px border + Radius/LG, 16px padding by default. */
export function Card({ children, dashed, style }: Props) {
  return <View style={[styles.card, dashed && styles.dashed, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface.default,
    borderColor: color.border.default,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing[16],
    overflow: 'hidden',
  },
  dashed: { borderStyle: 'dashed' },
});

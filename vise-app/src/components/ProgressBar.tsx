import { StyleSheet, View } from 'react-native';

import { color, radius } from '../theme/tokens';

interface Props {
  /** Fraction filled; values above 1 are capped visually (the real % is shown as text). */
  value: number;
  fillColor?: string;
  height?: number;
  accessibilityLabel?: string;
}

/** Finance/ProgressBar: 8px track, Radius/Full. */
export function ProgressBar({ value, fillColor = color.finance.underBudget, height = 8, accessibilityLabel }: Props) {
  const fraction = Math.max(0, Math.min(value, 1));
  return (
    <View
      accessible={accessibilityLabel != null}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
      style={[styles.track, { height }]}
    >
      <View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: fillColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: color.surface.variant,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.full },
});

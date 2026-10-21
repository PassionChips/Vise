import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

import { color, motion, radius, themed } from '../theme/tokens';
import { useReduceMotion } from './Glass';

interface Props {
  /** Fraction filled; values above 1 are capped visually (the real % is shown as text). */
  value: number;
  fillColor?: string;
  /** Defaults to Surface/Variant; the hero card uses a translucent white. */
  trackColor?: string;
  /** Use the brand gradient instead of a flat fill (healthy budgets, goals). */
  gradient?: boolean;
  height?: number;
  accessibilityLabel?: string;
}

/** Finance/ProgressBar: 8px track, Radius/Full. The fill grows in from the left. */
export function ProgressBar({ value, fillColor = color.finance.underBudget, trackColor, gradient, height = 8, accessibilityLabel }: Props) {
  const fraction = Math.max(0, Math.min(value, 1));
  const reduceMotion = useReduceMotion();
  const grow = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      grow.setValue(1);
      return;
    }
    grow.setValue(0);
    Animated.timing(grow, { toValue: 1, duration: motion.fill, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [fraction, reduceMotion, grow]);

  return (
    <View
      accessible={accessibilityLabel != null}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
      style={[styles.track, { height }, trackColor != null && { backgroundColor: trackColor }]}
    >
      <Animated.View
        style={[
          styles.fill,
          { width: `${fraction * 100}%`, backgroundColor: fillColor, transform: [{ scaleX: grow }] },
          gradient && styles.gradient,
        ]}
      />
    </View>
  );
}

const styles = themed(() => ({
  track: {
    width: '100%',
    backgroundColor: color.surface.variant,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.full, transformOrigin: 'left' },
  gradient: { experimental_backgroundImage: color.gradient.progress },
}));

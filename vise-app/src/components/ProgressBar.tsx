// Finance/ProgressBar. The fill is capped at 100%; show the real percentage in text next to it.

import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { colors, radius } from '../theme';

interface ProgressBarProps {
  /** Fraction complete, e.g. spent / limit. Values above 1 render as full. */
  value: number;
  /** e.g. "62 percent of Groceries budget used". */
  accessibilityLabel: string;
}

export function ProgressBar({ value, accessibilityLabel }: ProgressBarProps) {
  const target = Math.min(Math.max(value, 0), 1);
  const width = useRef(new Animated.Value(target)).current;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled) return;
      if (reduceMotion) {
        width.setValue(target);
        return;
      }
      Animated.timing(width, {
        toValue: target,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [target, width]);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(target * 100) }}
      style={styles.track}
    >
      <Animated.View
        style={[
          styles.fill,
          { width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.progressTrack,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    // Keeps a visible sliver at 0%, as in the design.
    minWidth: 2,
    borderRadius: radius.full,
    backgroundColor: colors.financeUnderBudget,
  },
});

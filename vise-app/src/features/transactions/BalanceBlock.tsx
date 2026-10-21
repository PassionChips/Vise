import { useMemo, useRef } from 'react';
import { Animated, PanResponder, Text, View } from 'react-native';
import ReAnimated, { FadeIn } from 'react-native-reanimated';

import { tick } from '../../data/haptics';
import { formatMoney } from '../../format';
import { color, spacing, themed, type } from '../../theme/tokens';

interface Props {
  /** Income minus spending for what is shown (the month, or a chosen day). */
  balance: number;
  income: number;
  spent: number;
  currency: string;
  /** "October 2026" or "Fri 25 Sep": says which period the numbers are for. */
  periodName: string;
  /** Swiped to the next (1) or previous (-1) month. */
  onStep: (delta: 1 | -1) => void;
}

/**
 * The financial position: the balance large, income and expenses beneath. Swipe it sideways to move to the next or
 * previous month (the screen reader gets increment and decrement actions instead). The numbers only ever follow the
 * chosen period; scrolling the list does not touch them.
 */
export function BalanceBlock({ balance, income, spent, currency, periodName, onStep }: Props) {
  const stepRef = useRef(onStep);
  stepRef.current = onStep;
  const drag = useRef(new Animated.Value(0)).current;

  const pan = useMemo(() => {
    const settle = () => Animated.spring(drag, { toValue: 0, useNativeDriver: true, speed: 28, bounciness: 5 }).start();
    return PanResponder.create({
      // Only a mostly horizontal drag; a vertical one belongs to the list.
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderMove: (_, g) => drag.setValue(Math.max(-36, Math.min(36, g.dx / 3))),
      onPanResponderRelease: (_, g) => {
        const flick = Math.abs(g.vx) > 0.6 && Math.abs(g.dx) > 24;
        if (g.dx <= -56 || (flick && g.dx < 0)) {
          tick();
          stepRef.current(1);
        } else if (g.dx >= 56 || (flick && g.dx > 0)) {
          tick();
          stepRef.current(-1);
        }
        settle();
      },
      onPanResponderTerminate: settle,
    });
  }, [drag]);

  const summary = `${periodName}. Balance ${formatMoney(balance, { currency })}. Income ${formatMoney(income, { currency })}. Expenses ${formatMoney(spent, { currency })}.`;

  return (
    <Animated.View
      {...pan.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={summary}
      accessibilityHint="Swipe up or down to change the month"
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => stepRef.current(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      style={[styles.block, { transform: [{ translateX: drag }] }]}
    >
      <Text style={[type.label, styles.secondary]}>BALANCE · {periodName.toUpperCase()}</Text>
      {/* A new period fades its numbers in instead of jumping. */}
      <ReAnimated.View key={periodName} entering={FadeIn.duration(160)} style={styles.numbers}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[type.numericLarge, { color: balance < 0 ? color.finance.overBudget : color.content.primary }]}>
          {formatMoney(balance, { currency })}
        </Text>
        <View style={styles.split}>
          <View style={styles.half}>
            <Text style={[type.label, styles.secondary]}>INCOME</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[type.numericMedium, { color: color.finance.remaining }]}>
              {formatMoney(income, { currency })}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.half}>
            <Text style={[type.label, styles.secondary]}>EXPENSES</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[type.numericMedium, styles.primary]}>
              {formatMoney(spent, { currency })}
            </Text>
          </View>
        </View>
      </ReAnimated.View>
    </Animated.View>
  );
}

const styles = themed(() => ({
  primary: { color: color.content.primary },
  secondary: { color: color.content.secondary },
  block: { gap: spacing[4], paddingVertical: spacing[8], paddingHorizontal: spacing[8] },
  numbers: { gap: spacing[8] },
  split: { flexDirection: 'row', alignItems: 'center', gap: spacing[16], marginTop: spacing[4] },
  half: { flex: 1, gap: 2 },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: color.glass.border },
}));

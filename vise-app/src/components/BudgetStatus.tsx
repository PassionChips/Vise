import { CircleAlert, CircleCheck, type LucideIcon, TriangleAlert } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { color, radius, spacing, themed, type } from '../theme/tokens';

export type BudgetHealth = 'healthy' | 'approaching' | 'over';

// A function, not a constant: colours must be read at render time so the theme can change.
const variants = (): Record<BudgetHealth, { icon: LucideIcon; label: string; fg: string; bg: string }> => ({
  healthy: { icon: CircleCheck, label: 'On track', fg: color.feedback.success, bg: color.feedback.successSubtle },
  approaching: { icon: TriangleAlert, label: 'Near limit', fg: color.feedback.warning, bg: color.feedback.warningSubtle },
  over: { icon: CircleAlert, label: 'OVER BUDGET', fg: color.feedback.error, bg: color.feedback.errorSubtle },
});

/** Healthy < threshold ≤ Approaching < 100% ≤ Over. */
export function budgetHealth(percentUsed: number, warningThreshold: number): BudgetHealth {
  if (percentUsed >= 100) return 'over';
  if (percentUsed >= warningThreshold) return 'approaching';
  return 'healthy';
}

/** Colour for amounts/fills that follow a budget's health. */
export function healthColor(health: BudgetHealth): string {
  if (health === 'over') return color.finance.overBudget;
  if (health === 'approaching') return color.feedback.warning;
  return color.finance.underBudget;
}

/** Finance/BudgetStatus pill: always icon + text, never colour alone. */
export function BudgetStatus({ status, label }: { status: BudgetHealth; label?: string }) {
  const { icon: Icon, label: defaultLabel, fg, bg } = variants()[status];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Icon size={14} strokeWidth={2} color={fg} />
      <Text style={[type.label, { color: fg }]}>{label ?? defaultLabel}</Text>
    </View>
  );
}

const styles = themed(() => ({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing[8],
    paddingVertical: 4,
    borderRadius: radius.full,
  },
}));

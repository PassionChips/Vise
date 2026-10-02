// Card/CategoryBudget and Finance/BudgetStatus.

import { CircleCheck, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';
import { ProgressBar } from './ProgressBar';

// Only the healthy state is specified in the design so far; add
// "approaching" and "over" once their tokens are defined.
export type BudgetHealth = 'healthy';

const statusCopy: Record<BudgetHealth, { label: string; spoken: string }> = {
  healthy: { label: 'On track', spoken: 'on track' },
};

/** Always icon + text: status is never conveyed by colour alone. */
export function BudgetStatus({ status }: { status: BudgetHealth }) {
  return (
    <View style={styles.pill}>
      <CircleCheck size={14} color={colors.feedbackSuccess} />
      <Text style={[typography.label, styles.pillLabel]}>{statusCopy[status].label}</Text>
    </View>
  );
}

interface CategoryBudgetCardProps {
  name: string;
  icon: LucideIcon;
  /** Pre-formatted money, e.g. "€310.40". */
  spent: string;
  limit: string;
  remaining: string;
  /** spent / limit × 100, uncapped (e.g. 108). */
  percentUsed: number;
  status: BudgetHealth;
  onPress?: () => void;
}

export function CategoryBudgetCard({
  name,
  icon: Icon,
  spent,
  limit,
  remaining,
  percentUsed,
  status,
  onPress,
}: CategoryBudgetCardProps) {
  const percent = Math.round(percentUsed);
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'summary'}
      accessibilityLabel={`${name}, ${spent} of ${limit}, ${percent} percent used, ${statusCopy[status].spoken}`}
      disabled={!onPress}
      onPress={onPress}
      style={styles.card}
    >
      <View style={styles.header}>
        <View style={styles.iconTile}>
          <Icon size={20} color={colors.contentPrimary} />
        </View>
        <View style={styles.text}>
          <View style={styles.titleRow}>
            <Text numberOfLines={1} style={[typography.headingMedium, styles.title]}>
              {name}
            </Text>
            <BudgetStatus status={status} />
          </View>
          <Text style={[typography.numericSmall, styles.secondary]}>
            {spent} of {limit}
          </Text>
        </View>
      </View>
      <ProgressBar value={percentUsed / 100} accessibilityLabel={`${percent} percent of ${name} budget used`} />
      <View style={styles.footer}>
        <Text style={[typography.numericSmall, styles.remaining]}>{remaining} left</Text>
        <Text style={[typography.numericSmall, styles.secondary]}>{percent}% used</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    minWidth: 280,
    maxWidth: 480,
    gap: spacing[12],
    padding: spacing[16],
    backgroundColor: colors.cardFill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
  },
  title: {
    flex: 1,
    color: colors.contentPrimary,
  },
  secondary: {
    color: colors.contentSecondary,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  remaining: {
    color: colors.financeRemaining,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    paddingHorizontal: spacing[8],
    paddingVertical: spacing[4],
    borderRadius: radius.full,
    backgroundColor: colors.feedbackSuccessSubtle,
  },
  pillLabel: {
    color: colors.feedbackSuccess,
  },
});

import {
  ArrowDownLeft,
  ArrowUpRight,
  type LucideIcon,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatMoney, percentOf } from '../format';
import { color, radius, spacing, type } from '../theme/tokens';
import { BudgetStatus, budgetHealth, healthColor } from './BudgetStatus';
import { Card } from './Card';
import { CategoryIcon } from './CategoryIcon';
import { ProgressBar } from './ProgressBar';

// ----- Card/FinancialSummary -----

type SummaryType = 'income' | 'spending' | 'remaining' | 'predicted';

const SUMMARY: Record<SummaryType, { label: string; icon: LucideIcon; tile: string; iconColor: string }> = {
  income: { label: 'Income', icon: ArrowDownLeft, tile: color.feedback.successSubtle, iconColor: color.brand.primary },
  spending: { label: 'Spending', icon: ArrowUpRight, tile: color.surface.variant, iconColor: color.content.primary },
  remaining: { label: 'Remaining', icon: Wallet, tile: color.feedback.successSubtle, iconColor: color.brand.primary },
  predicted: { label: 'Predicted', icon: Sparkles, tile: color.feedback.infoSubtle, iconColor: color.finance.predicted },
};

interface FinancialSummaryCardProps {
  type: SummaryType;
  amountCents: number;
  supportingText: string;
  /** Income only: shows a trend icon and colours the supporting text green. */
  trendUp?: boolean;
}

export function FinancialSummaryCard({ type: kind, amountCents, supportingText, trendUp }: FinancialSummaryCardProps) {
  const { label, icon: Icon, tile, iconColor } = SUMMARY[kind];
  const amountColor =
    kind === 'remaining'
      ? amountCents < 0 ? color.finance.overBudget : color.finance.remaining
      : color.content.primary;

  return (
    <Card
      dashed={kind === 'predicted'}
      style={styles.summaryCard}
    >
      <View
        accessible
        accessibilityLabel={`${label}, ${formatMoney(amountCents)}, ${supportingText}`}
        style={styles.summaryInner}
      >
        <View style={styles.row8}>
          <View style={[styles.tile32, { backgroundColor: tile }]}>
            <Icon size={18} strokeWidth={2} color={iconColor} />
          </View>
          <Text style={[type.bodySmall, styles.secondary]}>{label}</Text>
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[type.numericMedium, { color: amountColor }]}>
          {formatMoney(amountCents)}
        </Text>
        <View style={styles.row4}>
          {trendUp && <TrendingUp size={14} strokeWidth={2} color={color.feedback.success} />}
          <Text style={[type.bodySmall, styles.flex, trendUp ? styles.success : styles.secondary]}>
            {supportingText}
          </Text>
        </View>
      </View>
    </Card>
  );
}

// ----- Control/QuickAction -----

interface QuickActionProps {
  label: string;
  icon: LucideIcon;
  iconColor?: string;
  onPress?: () => void;
}

export function QuickAction({ label, icon: Icon, iconColor = color.content.primary, onPress }: QuickActionProps) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.quickAction}>
      {({ pressed }) => (
        <>
          <View style={[styles.quickTile, pressed && styles.quickTilePressed]}>
            <Icon size={22} strokeWidth={2} color={iconColor} />
          </View>
          <Text numberOfLines={1} style={[type.bodySmall, styles.primary, styles.center]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

// ----- Card/CategoryBudget -----

interface CategoryBudgetCardProps {
  name: string;
  icon: string | null;
  spentCents: number;
  limitCents: number;
  warningThreshold: number;
  /** Defaults to EUR. */
  currency?: string;
  onPress?: () => void;
}

export function CategoryBudgetCard({ name, icon, spentCents, limitCents, warningThreshold, currency, onPress }: CategoryBudgetCardProps) {
  const money = (cents: number) => formatMoney(cents, { currency });
  const percentUsed = percentOf(spentCents, limitCents);
  const health = budgetHealth(percentUsed, warningThreshold);
  const remaining = limitCents - spentCents;
  const footer = remaining < 0 ? `${money(-remaining)} over` : `${money(remaining)} left`;
  const statusWords = { healthy: 'on track', approaching: 'near limit', over: 'over budget' }[health];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${money(spentCents)} of ${money(limitCents)}, ${percentUsed} percent used, ${statusWords}`}
      disabled={!onPress}
      onPress={onPress}
    >
      <Card style={styles.gap12}>
        <View style={styles.row12}>
          <View style={[styles.tile40, { borderRadius: radius.md }]}>
            <CategoryIcon name={icon} />
          </View>
          <View style={styles.flexText}>
            <View style={styles.row8}>
              <Text numberOfLines={1} style={[type.headingMedium, styles.primary, styles.flex]}>{name}</Text>
              <BudgetStatus status={health} />
            </View>
            <Text style={[type.numericSmall, styles.secondary]}>
              {money(spentCents)} of {money(limitCents)}
            </Text>
          </View>
        </View>
        <ProgressBar value={limitCents > 0 ? spentCents / limitCents : 0} fillColor={healthColor(health)} />
        <View style={styles.spaceBetween}>
          <Text style={[type.numericSmall, { color: healthColor(health) }]}>{footer}</Text>
          <Text style={[type.numericSmall, styles.secondary]}>{percentUsed}% used</Text>
        </View>
      </Card>
    </Pressable>
  );
}

// ----- Card/Transaction -----

interface TransactionRowProps {
  title: string;
  subtitle: string;
  amountCents: number;
  icon: string | null;
  onPress?: () => void;
}

/** Sign AND colour show direction: income green, expenses neutral. */
export function TransactionRow({ title, subtitle, amountCents, icon, onPress }: TransactionRowProps) {
  const income = amountCents > 0;
  const amount = formatMoney(amountCents, { sign: 'always' });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}, ${income ? 'income' : 'expense'} ${formatMoney(Math.abs(amountCents))}`}
      onPress={onPress}
      style={({ pressed }) => [styles.transaction, pressed && styles.transactionPressed]}
    >
      <View style={[styles.tile40, { borderRadius: radius.full, backgroundColor: income ? color.feedback.successSubtle : color.surface.variant }]}>
        <CategoryIcon name={icon} color={income ? color.brand.primary : color.content.primary} />
      </View>
      <View style={styles.flexText}>
        <Text numberOfLines={1} style={[type.bodyLarge, styles.primary]}>{title}</Text>
        <Text numberOfLines={1} style={[type.bodySmall, styles.secondary]}>{subtitle}</Text>
      </View>
      <Text style={[type.numericSmall, { color: income ? color.finance.remaining : color.finance.spending }]}>{amount}</Text>
    </Pressable>
  );
}

/** List card that holds transaction rows (4px inset, no gap). */
export function TransactionList({ children }: { children: ReactNode }) {
  return <Card style={styles.list}>{children}</Card>;
}

// ----- Card/Goal -----

interface GoalCardProps {
  name: string;
  icon: string | null;
  subtitle: string;
  savedCents: number;
  targetCents: number;
}

/** Goals use Info teal for the icon so they read differently from budgets. */
export function GoalCard({ name, icon, subtitle, savedCents, targetCents }: GoalCardProps) {
  const complete = savedCents >= targetCents;
  const percent = percentOf(savedCents, targetCents);
  return (
    <Card style={styles.gap12}>
      <View style={styles.row12}>
        <View style={[styles.tile40, { borderRadius: radius.md, backgroundColor: color.feedback.infoSubtle }]}>
          <CategoryIcon name={icon} color={color.finance.predicted} />
        </View>
        <View style={styles.flexText}>
          <Text numberOfLines={1} style={[type.headingMedium, styles.primary]}>{name}</Text>
          <Text style={[type.bodySmall, styles.secondary]}>{subtitle}</Text>
        </View>
        {complete && <BudgetStatus status="healthy" label="Done" />}
      </View>
      <Text style={[type.numericSmall, styles.primary]}>
        {formatMoney(savedCents)} of {formatMoney(targetCents)}
      </Text>
      <ProgressBar value={savedCents / targetCents} accessibilityLabel={`${percent} percent of ${name} saved`} />
      <View style={styles.spaceBetween}>
        <Text style={[type.numericSmall, { color: color.finance.remaining }]}>
          {complete ? 'Goal reached' : `${formatMoney(targetCents - savedCents)} to go`}
        </Text>
        <Text style={[type.numericSmall, styles.secondary]}>{percent}%</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  primary: { color: color.content.primary },
  secondary: { color: color.content.secondary },
  success: { color: color.feedback.success },
  center: { textAlign: 'center' },
  flex: { flex: 1 },
  flexText: { flex: 1, gap: 2 },
  gap12: { gap: spacing[12] },
  row4: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  row8: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  row12: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  spaceBetween: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryCard: { flex: 1 },
  summaryInner: { gap: spacing[8] },
  tile32: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tile40: {
    width: 40,
    height: 40,
    backgroundColor: color.surface.variant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAction: { width: 76, alignItems: 'center', gap: spacing[8] },
  quickTile: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border.default,
    backgroundColor: color.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTilePressed: { backgroundColor: color.surface.variant },
  list: { padding: 4 },
  transaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    paddingHorizontal: spacing[16],
    paddingVertical: spacing[12],
    borderRadius: radius.md,
  },
  transactionPressed: { backgroundColor: color.surface.variant },
});

import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Alert } from '../../src/components/Alert';
import { IconButton, PrimaryButton } from '../../src/components/Buttons';
import { Card } from '../../src/components/Card';
import { CategoryBudgetCard } from '../../src/components/FinanceCards';
import { Screen, ScreenHeader, SectionHeader } from '../../src/components/Layout';
import { Toast } from '../../src/components/Overlays';
import { ProgressBar } from '../../src/components/ProgressBar';
import { EmptyState, QueryState } from '../../src/components/QueryState';
import { useFinance, type FinanceData } from '../../src/data/finance';
import { setDeletedBudget, useDeletedBudget } from '../../src/data/undo';
import { currentMonth, formatMoney, monthLabel, percentOf } from '../../src/format';
import { setCategoryBudget } from '../../src/services/viseCore';
import { color, spacing, themed, type } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function BudgetsScreen() {
  useTheme();
  const finance = useFinance(currentMonth());
  return <QueryState query={finance}>{(data) => <Budgets data={data} />}</QueryState>;
}

function Budgets({ data }: { data: FinanceData }) {
  const { month, settings, summary } = data;
  const currency = settings.currency;
  const deleted = useDeletedBudget();
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!deleted) return;
    const id = setTimeout(() => setDeletedBudget(null), 5000);
    return () => clearTimeout(id);
  }, [deleted]);

  async function undoDelete() {
    if (!deleted) return;
    setDeletedBudget(null);
    try {
      await setCategoryBudget({
        month: deleted.month,
        currency: deleted.currency,
        expense_category_id: deleted.categoryId,
        limit: `${Math.floor(deleted.limitCents / 100)}.${String(deleted.limitCents % 100).padStart(2, '0')}`,
      });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Could not restore the budget.');
    }
  }

  const budgets = summary.categories
    .filter((c) => c.limit_cents != null)
    .sort((a, b) => b.spent_cents / (b.limit_cents ?? 1) - a.spent_cents / (a.limit_cents ?? 1));
  const over = budgets.filter((c) => c.spent_cents > (c.limit_cents ?? 0));

  const total = summary.category_limits_total_cents;
  const spent = summary.budgeted_spent_cents;
  const left = total - spent;
  const usedPercent = percentOf(spent, total);
  const leftColor = left < 0 ? color.finance.overBudget : color.finance.remaining;

  return (
    <View style={styles.root}>
      <Screen>
        <ScreenHeader title="Budgets" action={<IconButton icon={Plus} accessibilityLabel="Create budget" filled onPress={() => router.push('/budget-form')} />} />
        <Text style={[type.bodySmall, styles.secondary]}>{monthLabel(month)}</Text>

        {failure && <Alert type="error" title="That didn’t work" description={failure} />}

        {budgets.length === 0 ? (
          <Card>
            <EmptyState
              title="No budgets yet"
              description="Set a monthly limit for a category and VISE will track how much you’ve used."
              action={<PrimaryButton label="Create a budget" size="small" onPress={() => router.push('/budget-form')} />}
            />
          </Card>
        ) : (
          <>
            <Card style={styles.overview}>
              <View style={styles.headline}>
                <Text style={[type.bodySmall, styles.secondary]}>Left to spend this month</Text>
                <Text style={[type.numericLarge, { color: leftColor }]}>{formatMoney(left, { currency })}</Text>
              </View>
              <ProgressBar
                value={total > 0 ? spent / total : 0}
                fillColor={usedPercent >= 100 ? color.finance.overBudget : color.finance.underBudget}
                accessibilityLabel={`${usedPercent} percent of this month's budget used`}
              />
              <View style={styles.stats}>
                <Stat label="Budget" value={formatMoney(total, { currency })} />
                <Stat label="Spent" value={formatMoney(spent, { currency })} />
                <Stat label="Used" value={`${usedPercent}%`} />
              </View>
              {summary.unbudgeted_spent_cents > 0 && (
                <Text style={[type.bodySmall, styles.secondary]}>
                  {formatMoney(summary.unbudgeted_spent_cents, { currency })} was spent in categories without a budget.
                </Text>
              )}
            </Card>

            {over.map((c) => (
              <Alert
                key={c.category_id}
                type="error"
                title={`${c.name} is ${formatMoney(c.spent_cents - (c.limit_cents ?? 0), { currency })} over budget`}
                description={`You have spent ${percentOf(c.spent_cents, c.limit_cents ?? 0)}% of your ${formatMoney(c.limit_cents ?? 0, { currency })} limit.`}
              />
            ))}

            <View style={styles.sectionHeader}>
              <SectionHeader
                title="By category"
                trailing={<Text style={[type.bodySmall, styles.secondary]}>Most used first</Text>}
              />
            </View>

            {budgets.map((c) => (
              <CategoryBudgetCard
                key={c.category_id}
                name={c.name}
                icon={c.icon}
                currency={currency}
                spentCents={c.spent_cents}
                limitCents={c.limit_cents ?? 0}
                warningThreshold={settings.warning_threshold_percent}
                onPress={() => router.push({ pathname: '/budget-form', params: { id: String(c.category_id) } })}
              />
            ))}
          </>
        )}
      </Screen>
      {deleted && <Toast message="Budget deleted" actionLabel="Undo" onAction={undoDelete} />}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[type.bodySmall, styles.secondary]}>{label}</Text>
      <Text style={[type.numericSmall, { color: color.content.primary }]}>{value}</Text>
    </View>
  );
}

const styles = themed(() => ({
  root: { flex: 1 },
  secondary: { color: color.content.secondary },
  overview: { padding: spacing[20], gap: spacing[16] },
  headline: { gap: 4 },
  stats: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { gap: 2 },
  sectionHeader: { paddingTop: spacing[8] },
}));

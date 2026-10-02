import { router, type Href } from 'expo-router';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Calendar,
  ChartNoAxesCombined,
  ChevronRight,
  Plus,
  Wallet,
} from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Avatar } from '../../src/components/Avatar';
import { IconButton, PrimaryButton, TertiaryButton } from '../../src/components/Buttons';
import { Card } from '../../src/components/Card';
import { SpendingChart } from '../../src/components/Charts';
import { SegmentedControl } from '../../src/components/Controls';
import {
  CategoryBudgetCard,
  FinancialSummaryCard,
  QuickAction,
  TransactionList,
  TransactionRow,
} from '../../src/components/FinanceCards';
import { Screen, SectionHeader } from '../../src/components/Layout';
import { BottomSheet, SheetAction } from '../../src/components/Overlays';
import { EmptyState, QueryState } from '../../src/components/QueryState';
import { describeTransaction, signedAmount, useFinance, type FinanceData } from '../../src/data/finance';
import { useCoreQuery } from '../../src/data/store';
import {
  currentMonth,
  daysLeftInMonth,
  formatMoney,
  formatShortDate,
  isoFromUnix,
  monthLabel,
  monthShort,
  percentOf,
  shiftMonth,
  todayIso,
} from '../../src/format';
import { getSpendingTrend, predictSpending } from '../../src/services/viseCore';
import { color, spacing, themed, type } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

const RANGES = ['3M', '6M', '12M'] as const;
const RANGE_MONTHS = { '3M': 3, '6M': 6, '12M': 12 } as const;

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardScreen() {
  useTheme();
  const month = currentMonth();
  const finance = useFinance(month);

  return (
    <QueryState query={finance}>{(data) => <Dashboard data={data} />}</QueryState>
  );
}

function Dashboard({ data }: { data: FinanceData }) {
  const { month, settings, summary, transactions, categories, sources } = data;
  const currency = settings.currency;
  const [addOpen, setAddOpen] = useState(false);
  const name = settings.display_name;

  const go = (href: Href) => {
    setAddOpen(false);
    router.push(href);
  };

  const budgets = summary.categories
    .filter((c) => c.limit_cents != null)
    .sort((a, b) => b.spent_cents / (b.limit_cents ?? 1) - a.spent_cents / (a.limit_cents ?? 1))
    .slice(0, 3);
  const recent = transactions.slice(0, 4);
  const today = todayIso();

  const incomeSupport =
    summary.expected_income_cents != null
      ? `of ${formatMoney(summary.expected_income_cents, { currency })} expected`
      : 'No income expected yet';

  return (
    <Screen gap={spacing[24]}>
      <View style={styles.header}>
        <Avatar name={name ?? 'You'} avatarId={settings.avatar} />
        <View style={styles.greeting}>
          <Text style={[type.bodySmall, styles.secondary]}>{greeting(new Date().getHours())}</Text>
          <Text numberOfLines={1} style={[type.headingLarge, styles.primary]}>{name ?? 'Welcome'}</Text>
        </View>
        <IconButton icon={Bell} accessibilityLabel="Notifications" />
        <IconButton icon={Plus} accessibilityLabel="Quick add" filled onPress={() => setAddOpen(true)} />
      </View>

      <View style={styles.monthSelector}>
        <View style={styles.monthLabel}>
          <Calendar size={20} strokeWidth={2} color={color.content.primary} />
          <Text style={[type.button, styles.primary]}>{monthLabel(month)}</Text>
        </View>
        <Text style={[type.bodySmall, styles.secondary]}>{daysLeftInMonth(month)} days left</Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <FinancialSummaryCard
            type="income"
            currency={currency}
            amountCents={summary.income_cents}
            supportingText={incomeSupport}
          />
          <FinancialSummaryCard
            type="spending"
            currency={currency}
            amountCents={summary.spent_cents}
            supportingText={`${percentOf(summary.spent_cents, summary.income_basis_cents)}% of income`}
          />
        </View>
        <View style={styles.gridRow}>
          <FinancialSummaryCard
            type="remaining"
            currency={currency}
            amountCents={summary.left_cents}
            supportingText="Income − spending"
          />
          <PredictedCard month={month} currency={currency} />
        </View>
      </View>

      <View style={styles.quickActions}>
        <QuickAction label="Add income" icon={ArrowDownLeft} iconColor={color.brand.primary} onPress={() => go({ pathname: '/add-transaction', params: { type: 'income' } })} />
        <QuickAction label="Add expense" icon={Plus} onPress={() => go('/add-transaction')} />
        <QuickAction label="New budget" icon={Wallet} onPress={() => router.push('/budget-form')} />
        <QuickAction label="Reports" icon={ChartNoAxesCombined} onPress={() => router.navigate('/reports')} />
      </View>

      <SpendingCard month={month} currency={currency} />

      <View style={styles.section}>
        <SectionHeader
          title="Category budgets"
          trailing={<TertiaryButton label="View all" trailingIcon={ChevronRight} onPress={() => router.navigate('/budgets')} />}
        />
        {budgets.length === 0 ? (
          <Card>
            <EmptyState
              title="No category budgets yet"
              description="Set a monthly limit for a category to see how you’re doing against it."
              action={<PrimaryButton label="Create a budget" size="small" onPress={() => router.push('/budget-form')} />}
            />
          </Card>
        ) : (
          budgets.map((c) => (
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
          ))
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Recent transactions"
          trailing={<TertiaryButton label="View all" trailingIcon={ChevronRight} onPress={() => router.navigate('/transactions')} />}
        />
        {recent.length === 0 ? (
          <Card>
            <EmptyState
              title="No transactions this month"
              description="Add your first expense or income and it will show up here."
              action={<PrimaryButton label="Add a transaction" size="small" onPress={() => router.push('/add-transaction')} />}
            />
          </Card>
        ) : (
          <TransactionList>
            {recent.map((t) => {
              const label = describeTransaction(t, categories, sources);
              return (
                <TransactionRow
                  key={t.id}
                  title={label.title}
                  subtitle={`${label.group} · ${formatShortDate(isoFromUnix(t.occurred_at), today)}`}
                  amountCents={signedAmount(t)}
                  currency={currency}
                  icon={label.icon}
                  onPress={() => router.navigate('/transactions')}
                />
              );
            })}
          </TransactionList>
        )}
      </View>

      <BottomSheet visible={addOpen} title="Add" onClose={() => setAddOpen(false)}>
        <SheetAction icon={ArrowUpRight} title="Expense" subtitle="Something you paid for" onPress={() => go('/add-transaction')} />
        <SheetAction
          icon={ArrowDownLeft}
          tint={color.brand.primary}
          tileBackground={color.brand.subtle}
          title="Income"
          subtitle="Salary, refunds, side work"
          onPress={() => go({ pathname: '/add-transaction', params: { type: 'income' } })}
        />
        <SheetAction icon={Wallet} tint={color.brand.primary} tileBackground={color.brand.subtle} title="Budget" subtitle="Set a monthly limit for a category" onPress={() => go('/budget-form')} />
      </BottomSheet>
    </Screen>
  );
}

function PredictedCard({ month, currency }: { month: string; currency: string }) {
  const prediction = useCoreQuery(() => predictSpending(month, currency), [month, currency]);
  const p = prediction.data;
  const text = !p
    ? prediction.error ? 'Unavailable' : 'Loading…'
    : p.method === 'no_data'
      ? 'Needs a month of history'
      : `Estimate · last ${p.months_used} months`;
  return (
    <FinancialSummaryCard type="predicted" currency={currency} amountCents={p?.predicted_spent_cents ?? 0} supportingText={text} />
  );
}

/** Monthly spending for the last N months, plus the estimate for next month. */
function SpendingCard({ month, currency }: { month: string; currency: string }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>('6M');
  const next = shiftMonth(month, 1);
  const history = useCoreQuery(
    async () => {
      const [trend, prediction] = await Promise.all([
        getSpendingTrend(month, currency, RANGE_MONTHS[range]),
        predictSpending(next, currency),
      ]);
      return { trend, prediction };
    },
    [month, currency, range],
  );

  const bars = history.data
    ? [
        ...history.data.trend.map((m) => ({ label: monthShort(m.month), spent_cents: m.spent_cents, predicted: false })),
        ...(history.data.prediction.method !== 'no_data'
          ? [{ label: monthShort(next), spent_cents: history.data.prediction.predicted_spent_cents, predicted: true }]
          : []),
      ]
    : [];
  const hasSpending = bars.some((b) => b.spent_cents > 0);
  const current = history.data?.trend.at(-1)?.spent_cents ?? 0;
  const summary = `${formatMoney(current, { currency })} spent so far in ${monthLabel(month)}.${
    bars.some((b) => b.predicted) ? ' The last bar is an estimate.' : ''
  }`;

  return (
    <Card style={styles.spendingCard}>
      <View style={styles.spendingHeader}>
        <Text accessibilityRole="header" style={[type.headingMedium, styles.primary]}>Spending</Text>
        <SegmentedControl options={RANGES} value={range} onChange={setRange} accessibilityLabel="Chart range" />
      </View>
      {history.error && !history.data ? (
        <Text style={[type.bodyMedium, styles.secondary]}>{history.error.message}</Text>
      ) : !history.data ? (
        <Text style={[type.bodyMedium, styles.secondary]}>Loading…</Text>
      ) : !hasSpending ? (
        <EmptyState title="No spending yet" description="Your spending history will appear here once you add expenses." />
      ) : (
        <>
          <SpendingChart weeks={bars} summary={summary} />
          <Text style={[type.bodySmall, styles.secondary]}>{summary}</Text>
        </>
      )}
    </Card>
  );
}

const styles = themed(() => ({
  primary: { color: color.content.primary },
  secondary: { color: color.content.secondary },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  greeting: { flex: 1 },
  monthSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  grid: { gap: spacing[12] },
  gridRow: { flexDirection: 'row', gap: spacing[12] },
  quickActions: { flexDirection: 'row', justifyContent: 'space-between' },
  spendingCard: { gap: spacing[16] },
  spendingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { gap: spacing[12] },
}));

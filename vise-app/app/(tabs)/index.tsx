import { router, type Href } from 'expo-router';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Calendar,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  Plus,
  Target,
  Wallet,
} from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '../../src/components/Avatar';
import { IconButton, SecondaryButton, TertiaryButton } from '../../src/components/Buttons';
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
import { useBudgets } from '../../src/data/budgetStore';
import {
  DEMO_TODAY,
  dashboardBudgetIds,
  month,
  recentTransactionIds,
  summary,
  transactions,
  user,
  warningThresholdPercent,
  weeklySpending,
  weeklySpendingSummary,
} from '../../src/data/demo';
import { formatShortDate, percentOf } from '../../src/format';
import { color, spacing, type } from '../../src/theme/tokens';

const RANGES = ['Week', 'Month', '3M'] as const;

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardScreen() {
  const [range, setRange] = useState<(typeof RANGES)[number]>('Month');
  const [addOpen, setAddOpen] = useState(false);

  const go = (href: Href) => {
    setAddOpen(false);
    router.push(href);
  };

  const { budgets: allBudgets } = useBudgets();
  const budgets = dashboardBudgetIds
    .map((id) => allBudgets.find((c) => c.category_id === id))
    .filter((c) => c != null);
  const recent = recentTransactionIds
    .map((id) => transactions.find((t) => t.id === id))
    .filter((t) => t != null);

  return (
    <Screen gap={spacing[24]}>
      <View style={styles.header}>
        <Avatar name={user.name} />
        <View style={styles.greeting}>
          <Text style={[type.bodySmall, styles.secondary]}>{greeting(new Date().getHours())}</Text>
          <Text numberOfLines={1} style={[type.headingLarge, styles.primary]}>{user.firstName}</Text>
        </View>
        <IconButton icon={Bell} accessibilityLabel="Notifications" />
        <IconButton icon={Plus} accessibilityLabel="Quick add" filled onPress={() => setAddOpen(true)} />
      </View>

      <View style={styles.monthSelector}>
        <SecondaryButton
          size="small"
          label={month.label}
          leadingIcon={Calendar}
          trailingIcon={ChevronDown}
          accessibilityLabel={`Month: ${month.label}. Change month`}
        />
        <Text style={[type.bodySmall, styles.secondary]}>{month.daysLeft} days left</Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <FinancialSummaryCard
            type="income"
            amountCents={summary.income_cents}
            supportingText={`+${summary.income_change_percent}% vs ${summary.previous_month_name}`}
            trendUp
          />
          <FinancialSummaryCard
            type="spending"
            amountCents={summary.spent_cents}
            supportingText={`${percentOf(summary.spent_cents, summary.income_cents)}% of income`}
          />
        </View>
        <View style={styles.gridRow}>
          <FinancialSummaryCard type="remaining" amountCents={summary.remaining_cents} supportingText="Income − spending" />
          <FinancialSummaryCard type="predicted" amountCents={summary.predicted_cents} supportingText="Estimate · last 3 months" />
        </View>
      </View>

      <View style={styles.quickActions}>
        <QuickAction label="Add income" icon={ArrowDownLeft} iconColor={color.brand.primary} onPress={() => go({ pathname: '/add-transaction', params: { type: 'income' } })} />
        <QuickAction label="Add expense" icon={Plus} onPress={() => go('/add-transaction')} />
        <QuickAction label="New budget" icon={Wallet} onPress={() => router.push('/budget-form')} />
        <QuickAction label="Reports" icon={ChartNoAxesCombined} onPress={() => router.navigate('/reports')} />
      </View>

      <Card style={styles.spendingCard}>
        <View style={styles.spendingHeader}>
          <Text accessibilityRole="header" style={[type.headingMedium, styles.primary]}>Spending</Text>
          <SegmentedControl options={RANGES} value={range} onChange={setRange} accessibilityLabel="Chart range" />
        </View>
        <SpendingChart weeks={weeklySpending} summary={weeklySpendingSummary} />
        <Text style={[type.bodySmall, styles.secondary]}>{weeklySpendingSummary}</Text>
      </Card>

      <View style={styles.section}>
        <SectionHeader
          title="Category budgets"
          trailing={<TertiaryButton label="View all" trailingIcon={ChevronRight} onPress={() => router.navigate('/budgets')} />}
        />
        {budgets.map((c) => (
          <CategoryBudgetCard
            key={c.category_id}
            name={c.name}
            icon={c.icon}
            spentCents={c.spent_cents}
            limitCents={c.limit_cents}
            warningThreshold={warningThresholdPercent}
          />
        ))}
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Recent transactions"
          trailing={<TertiaryButton label="View all" trailingIcon={ChevronRight} onPress={() => router.navigate('/transactions')} />}
        />
        <TransactionList>
          {recent.map((t) => (
            <TransactionRow
              key={t.id}
              title={t.title}
              subtitle={`${t.category} · ${formatShortDate(t.date, DEMO_TODAY)}`}
              amountCents={t.amount_cents}
              icon={t.icon}
            />
          ))}
        </TransactionList>
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
        <SheetAction icon={Target} tint={color.finance.predicted} tileBackground={color.feedback.infoSubtle} title="Savings goal" subtitle="Track progress toward a target" onPress={() => go('/goals')} />
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  primary: { color: color.content.primary },
  secondary: { color: color.content.secondary },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  greeting: { flex: 1 },
  monthSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { gap: spacing[12] },
  gridRow: { flexDirection: 'row', gap: spacing[12] },
  quickActions: { flexDirection: 'row', justifyContent: 'space-between' },
  spendingCard: { gap: spacing[16] },
  spendingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { gap: spacing[12] },
});

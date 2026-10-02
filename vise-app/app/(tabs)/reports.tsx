import { TrendingDown, TrendingUp } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '../../src/components/Card';
import { CategoryBreakdown, IncomeExpenseChart } from '../../src/components/Charts';
import { FilterChipRow } from '../../src/components/Controls';
import { Screen, TopAppBar } from '../../src/components/Layout';
import { EmptyState, ErrorView, LoadingView } from '../../src/components/QueryState';
import { useCoreQuery } from '../../src/data/store';
import { currentMonth, formatMoney, formatSignedPercent, monthLabel, monthShort, shiftMonth } from '../../src/format';
import {
  getCategoryBreakdown,
  getMonthlySummary,
  getSettings,
  listCategories,
} from '../../src/services/viseCore';
import type { CategoryBreakdown as CategoryBreakdownRow, ExpenseCategory, MonthlySummary } from '../../src/services/types';
import { color, spacing, type } from '../../src/theme/tokens';

const RANGES = ['3M', '6M', '12M'] as const;
const RANGE_MONTHS = { '3M': 3, '6M': 6, '12M': 12 } as const;

export default function ReportsScreen() {
  const [range, setRange] = useState<(typeof RANGES)[number]>('6M');
  const month = currentMonth();

  const report = useCoreQuery(async () => {
    const settings = await getSettings();
    const count = RANGE_MONTHS[range];
    const months = Array.from({ length: count }, (_, i) => shiftMonth(month, i - (count - 1)));
    const [summaries, breakdown, categories] = await Promise.all([
      Promise.all(months.map((m) => getMonthlySummary(m, settings.currency))),
      getCategoryBreakdown(month, settings.currency),
      listCategories(),
    ]);
    return { currency: settings.currency, summaries, breakdown, categories };
  }, [range, month]);

  return (
    <Screen header={<TopAppBar title="Reports" />}>
      <FilterChipRow options={RANGES} value={range} onChange={setRange} />
      {report.data === undefined ? (
        report.error ? <ErrorView error={report.error} onRetry={report.reload} /> : <LoadingView />
      ) : (
        <ReportBody month={month} {...report.data} />
      )}
    </Screen>
  );
}

interface ReportData {
  currency: string;
  summaries: MonthlySummary[];
  breakdown: CategoryBreakdownRow[];
  categories: ExpenseCategory[];
}

function ReportBody({ month, currency, summaries, breakdown, categories }: ReportData & { month: string }) {
  const money = (cents: number, whole = false) => formatMoney(cents, { currency, whole });
  const hasData = summaries.some((s) => s.income_cents > 0 || s.spent_cents > 0);

  if (!hasData) {
    return (
      <Card>
        <EmptyState
          title="No data to report yet"
          description="Add some income and expenses and your reports will appear here."
        />
      </Card>
    );
  }

  const completed = summaries.slice(0, -1);
  const current = summaries[summaries.length - 1];
  const previous = summaries[summaries.length - 2];
  const income = completed.reduce((sum, s) => sum + s.income_cents, 0);
  const kept = completed.reduce((sum, s) => sum + s.net_cents, 0);
  const averageSpent = completed.length ? Math.round(completed.reduce((sum, s) => sum + s.spent_cents, 0) / completed.length) : 0;
  const headline = `You kept ${money(kept)} of ${money(income)} income over ${completed.length} ${completed.length === 1 ? 'month' : 'months'}`;
  const detail = `Average monthly spending ${money(averageSpent, true)}. ${monthLabel(month)} is in progress, so it’s excluded from averages.`;

  const chartMonths = summaries.map((s, i) => ({
    label: monthShort(s.month),
    income_cents: s.income_cents,
    spent_cents: s.spent_cents,
    in_progress: i === summaries.length - 1,
  }));

  const breakdownItems = breakdown.map((b) => ({
    name: b.name,
    icon: categories.find((c) => c.id === b.category_id)?.icon ?? null,
    spent_cents: b.spent_cents,
    percentage: b.percentage,
  }));

  const changes = current.categories
    .map((c) => {
      const before = previous.categories.find((p) => p.category_id === c.category_id)?.spent_cents ?? 0;
      return { name: c.name, before, change_cents: c.spent_cents - before };
    })
    .filter((row) => row.change_cents !== 0)
    .sort((a, b) => Math.abs(b.change_cents) - Math.abs(a.change_cents))
    .slice(0, 3);

  return (
    <>
      <Card style={styles.insight}>
        <Text style={[type.label, styles.secondary]}>{`${monthShort(summaries[0].month)} – ${monthLabel(month)}`.toUpperCase()}</Text>
        <Text style={[type.headingMedium, styles.primary]}>{completed.length ? headline : 'Not enough history for a summary yet'}</Text>
        {completed.length > 0 && <Text style={[type.bodySmall, styles.secondary]}>{detail}</Text>}
      </Card>

      <Card style={styles.gap16}>
        <Text accessibilityRole="header" style={[type.headingMedium, styles.primary]}>Income vs expenses</Text>
        <IncomeExpenseChart months={chartMonths} summary={`${headline}. ${detail}`} />
      </Card>

      <Card style={styles.gap16}>
        <View style={styles.spaceBetween}>
          <Text accessibilityRole="header" style={[type.headingMedium, styles.primary]}>Where {monthLabel(month)} went</Text>
          <Text style={[type.numericSmall, styles.primary]}>{money(current.spent_cents)}</Text>
        </View>
        {breakdownItems.length > 0 ? (
          <CategoryBreakdown items={breakdownItems} />
        ) : (
          <Text style={[type.bodyMedium, styles.secondary]}>No spending this month yet.</Text>
        )}
      </Card>

      <Card style={styles.gap16}>
        <Text accessibilityRole="header" style={[type.headingMedium, styles.primary]}>
          Compared with {monthLabel(previous.month)}
        </Text>
        {changes.length === 0 ? (
          <Text style={[type.bodyMedium, styles.secondary]}>Nothing to compare yet.</Text>
        ) : (
          changes.map((row) => {
            const up = row.change_cents > 0;
            // Spending more is a warning; spending less is good.
            const tint = up ? color.feedback.warning : color.feedback.success;
            const Trend = up ? TrendingUp : TrendingDown;
            const percent = row.before > 0 ? ` (${formatSignedPercent(Math.round((row.change_cents / row.before) * 100))})` : '';
            return (
              <View key={row.name} style={styles.changeRow}>
                <Trend size={16} strokeWidth={2} color={tint} />
                <Text numberOfLines={1} style={[type.bodyMedium, styles.primary, styles.flex]}>{row.name}</Text>
                <Text style={[type.numericSmall, { color: tint }]}>{formatMoney(row.change_cents, { sign: 'always', currency })}{percent}</Text>
              </View>
            );
          })
        )}
        <Text style={[type.bodySmall, styles.secondary]}>
          {monthLabel(month)} so far against all of {monthLabel(previous.month)}.
        </Text>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  primary: { color: color.content.primary },
  secondary: { color: color.content.secondary },
  flex: { flex: 1 },
  insight: { gap: 6 },
  gap16: { gap: spacing[16] },
  spaceBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
});

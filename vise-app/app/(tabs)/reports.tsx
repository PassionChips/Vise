import { Download, TrendingDown, TrendingUp } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { IconButton } from '../../src/components/Buttons';
import { Card } from '../../src/components/Card';
import { CategoryBreakdown, IncomeExpenseChart } from '../../src/components/Charts';
import { FilterChipRow } from '../../src/components/Controls';
import { Screen, TopAppBar } from '../../src/components/Layout';
import {
  categoryBreakdown,
  incomeVsExpenses,
  monthOverMonth,
  reportPeriod,
  summary,
} from '../../src/data/demo';
import { formatMoney, formatSignedPercent } from '../../src/format';
import { color, spacing, type } from '../../src/theme/tokens';

const RANGES = ['Month', '3M', '6M', 'Year', 'Custom'] as const;

export default function ReportsScreen() {
  const [range, setRange] = useState<(typeof RANGES)[number]>('6M');

  const headline = `You kept ${formatMoney(reportPeriod.kept_cents)} of ${formatMoney(reportPeriod.income_cents)} income over ${reportPeriod.months} months`;
  const detail =
    `Average monthly spending ${formatMoney(reportPeriod.average_spent_cents, { whole: true })} (${reportPeriod.average_range}). ` +
    `${reportPeriod.in_progress_month} is in progress, so it’s excluded from averages.`;

  return (
    <Screen
      header={<TopAppBar title="Reports" action={<IconButton icon={Download} accessibilityLabel="Export report" />} />}
    >
      <FilterChipRow options={RANGES} value={range} onChange={setRange} />

      <Card style={styles.insight}>
        <Text style={[type.label, styles.secondary]}>{reportPeriod.label}</Text>
        <Text style={[type.headingMedium, styles.primary]}>{headline}</Text>
        <Text style={[type.bodySmall, styles.secondary]}>{detail}</Text>
      </Card>

      <Card style={styles.gap16}>
        <Text accessibilityRole="header" style={[type.headingMedium, styles.primary]}>Income vs expenses</Text>
        <IncomeExpenseChart months={incomeVsExpenses} summary={`${headline}. ${detail}`} />
      </Card>

      <Card style={styles.gap16}>
        <View style={styles.spaceBetween}>
          <Text accessibilityRole="header" style={[type.headingMedium, styles.primary]}>
            Where {reportPeriod.in_progress_month} went
          </Text>
          <Text style={[type.numericSmall, styles.primary]}>{formatMoney(summary.spent_cents)}</Text>
        </View>
        <CategoryBreakdown items={categoryBreakdown} />
      </Card>

      <Card style={styles.gap16}>
        <Text accessibilityRole="header" style={[type.headingMedium, styles.primary]}>
          Compared with {monthOverMonth.compared_with}
        </Text>
        {monthOverMonth.rows.map((row) => {
          const up = row.change_cents > 0;
          // Spending more is a warning; spending less is good.
          const tint = up ? color.feedback.warning : color.feedback.success;
          const Trend = up ? TrendingUp : TrendingDown;
          return (
            <View key={row.name} style={styles.changeRow}>
              <Trend size={16} strokeWidth={2} color={tint} />
              <Text numberOfLines={1} style={[type.bodyMedium, styles.primary, styles.flex]}>{row.name}</Text>
              <Text style={[type.numericSmall, { color: tint }]}>
                {formatMoney(row.change_cents, { sign: 'always' })} ({formatSignedPercent(row.change_percent)})
              </Text>
            </View>
          );
        })}
        <Text style={[type.bodySmall, styles.secondary]}>
          Compared at the same day of the month (day {monthOverMonth.day_of_month}).
        </Text>
      </Card>
    </Screen>
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

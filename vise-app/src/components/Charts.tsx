import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { formatMoney } from '../format';
import { color, spacing, type } from '../theme/tokens';
import { CategoryIcon } from './CategoryIcon';
import { ProgressBar } from './ProgressBar';

// Simple bar charts drawn with Views. Each chart is exposed to screen readers as
// one element whose label is the text summary rendered next to it.

function Legend({ items }: { items: { label: string; swatch: StyleProp<ViewStyle> }[] }) {
  return (
    <View style={styles.legend}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.swatch, item.swatch]} />
          <Text style={[type.bodySmall, styles.secondary]}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ----- Finance/SpendingChart -----

interface SpendingChartProps {
  weeks: { label: string; spent_cents: number; predicted: boolean }[];
  /** One-sentence summary; also the chart's accessibilityLabel. */
  summary: string;
  showPredictions?: boolean;
}

const SPENDING_MAX_BAR = 106;

export function SpendingChart({ weeks, summary, showPredictions = true }: SpendingChartProps) {
  const visible = showPredictions ? weeks : weeks.filter((w) => !w.predicted);
  const max = Math.max(...visible.map((w) => w.spent_cents), 1);
  const hasPredicted = visible.some((w) => w.predicted);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary} style={styles.chart}>
      <View style={[styles.plot, { height: 140 }]}>
        {visible.map((week) => (
          <View key={week.label} style={styles.column}>
            <View
              style={[
                styles.spendingBar,
                { height: Math.max(2, (week.spent_cents / max) * SPENDING_MAX_BAR) },
                week.predicted ? styles.predictedBar : styles.actualBar,
              ]}
            />
            <Text style={[type.bodySmall, styles.secondary]}>{week.label}</Text>
          </View>
        ))}
      </View>
      <Legend
        items={[
          { label: 'Actual', swatch: styles.actualBar },
          ...(hasPredicted ? [{ label: 'Estimate', swatch: [styles.predictedBar, styles.thinDashed] }] : []),
        ]}
      />
    </View>
  );
}

// ----- Finance/IncomeExpenseChart -----

interface IncomeExpenseChartProps {
  months: { label: string; income_cents: number; spent_cents: number; in_progress: boolean }[];
  summary: string;
}

const INCOME_EXPENSE_MAX_BAR = 113;

export function IncomeExpenseChart({ months, summary }: IncomeExpenseChartProps) {
  const max = Math.max(...months.flatMap((m) => [m.income_cents, m.spent_cents]), 1);
  const height = (cents: number) => Math.max(2, (cents / max) * INCOME_EXPENSE_MAX_BAR);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary} style={[styles.chart, { gap: 10 }]}>
      <View style={[styles.plot, styles.plotSpaced, { height: 150 }]}>
        {months.map((m) => (
          <View key={m.label} style={styles.monthColumn}>
            <View style={styles.barPair}>
              <View style={[styles.pairBar, styles.income, { height: height(m.income_cents) }]} />
              <View style={[styles.pairBar, styles.expense, m.in_progress && styles.inProgress, { height: height(m.spent_cents) }]} />
            </View>
            <Text style={[type.bodySmall, styles.secondary]}>{m.label}</Text>
          </View>
        ))}
      </View>
      <Legend
        items={[
          { label: 'Income', swatch: styles.income },
          { label: 'Expenses', swatch: styles.expense },
          { label: 'Month in progress', swatch: [styles.expense, styles.inProgress] },
        ]}
      />
    </View>
  );
}

// ----- Finance/CategoryBreakdown -----

interface CategoryBreakdownProps {
  items: { name: string; icon: string | null; spent_cents: number; percentage: number }[];
}

/** Bars are relative to the largest category; % is share of total spending. */
export function CategoryBreakdown({ items }: CategoryBreakdownProps) {
  const max = Math.max(...items.map((i) => i.spent_cents), 1);
  return (
    <View style={styles.breakdown}>
      {items.map((item) => (
        <View
          key={item.name}
          accessible
          accessibilityLabel={`${item.name}, ${formatMoney(item.spent_cents)}, ${item.percentage} percent of spending`}
          style={styles.breakdownRow}
        >
          <View style={styles.breakdownTop}>
            <CategoryIcon name={item.icon} size={16} />
            <Text numberOfLines={1} style={[type.bodyMedium, styles.primary, styles.flex]}>{item.name}</Text>
            <Text style={[type.numericSmall, styles.primary]}>{formatMoney(item.spent_cents)}</Text>
            <Text style={[type.numericSmall, styles.secondary, styles.percent]}>{item.percentage}%</Text>
          </View>
          <ProgressBar value={item.spent_cents / max} fillColor={color.brand.primary} height={6} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  primary: { color: color.content.primary },
  secondary: { color: color.content.secondary },
  flex: { flex: 1 },
  chart: { gap: spacing[8], alignSelf: 'stretch' },
  plot: { flexDirection: 'row', alignItems: 'flex-end', overflow: 'hidden' },
  plotSpaced: { justifyContent: 'space-between' },
  column: { flex: 1, alignItems: 'center', gap: 6 },
  spendingBar: { width: 36, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  actualBar: { backgroundColor: color.brand.primary },
  predictedBar: {
    backgroundColor: color.feedback.infoSubtle,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.finance.predicted,
  },
  thinDashed: { borderWidth: 1 },
  monthColumn: { alignItems: 'center', gap: 6 },
  barPair: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  pairBar: { width: 14, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  income: { backgroundColor: color.finance.remaining },
  expense: { backgroundColor: color.finance.spending },
  inProgress: { opacity: 0.4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  breakdown: { gap: 14 },
  breakdownRow: { gap: 6 },
  breakdownTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  percent: { width: 40, textAlign: 'right' },
});

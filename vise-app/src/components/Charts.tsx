import { useState } from 'react';
import { Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { isLabelShown, labelStride } from '../data/chartLayout';
import { formatMoney } from '../format';
import { color, spacing, themed, type } from '../theme/tokens';
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

/**
 * Measures the plot so every column gets an exact equal share of its width
 * (flex alone is unreliable inside the horizontally swipeable Reports card),
 * and works out which labels fit. Bars scale with the columns; labels that
 * would overlap are thinned out, keeping the newest.
 */
function useColumnLabels(count: number) {
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const stride = labelStride(width, count);
  // Until measured, columns fall back to flex: 1.
  const column: ViewStyle | undefined = width > 0 && count > 0 ? { width: width / count, flex: 0 } : undefined;
  return { onLayout, column, shown: (index: number) => isLabelShown(index, count, stride) };
}

/** Month label under a column; a hidden one keeps its height so bars stay aligned. */
function ColumnLabel({ text, shown }: { text: string; shown: boolean }) {
  return (
    <Text numberOfLines={1} style={[type.bodySmall, styles.secondary, styles.columnLabel]}>
      {shown ? text : ' '}
    </Text>
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
  const labels = useColumnLabels(visible.length);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary} style={styles.chart}>
      <View onLayout={labels.onLayout} style={[styles.plot, { height: 140 }]}>
        {/* Keyed by position: an estimate can share its month label with the oldest bar (e.g. two "Nov"). */}
        {visible.map((week, index) => (
          <View key={index} style={[styles.column, labels.column]}>
            <View
              style={[
                styles.spendingBar,
                { height: Math.max(2, (week.spent_cents / max) * SPENDING_MAX_BAR) },
                week.predicted ? styles.predictedBar : styles.actualBar,
              ]}
            />
            <ColumnLabel text={week.label} shown={labels.shown(index)} />
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
  const labels = useColumnLabels(months.length);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary} style={[styles.chart, { gap: 10 }]}>
      <View onLayout={labels.onLayout} style={[styles.plot, { height: 150 }]}>
        {months.map((m, index) => (
          <View key={index} style={[styles.monthColumn, labels.column]}>
            <View style={styles.barPair}>
              <View style={[styles.pairBar, styles.income, { height: height(m.income_cents) }]} />
              <View style={[styles.pairBar, styles.expense, m.in_progress && styles.inProgress, { height: height(m.spent_cents) }]} />
            </View>
            <ColumnLabel text={m.label} shown={labels.shown(index)} />
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

// ----- Finance/NetChart -----

interface NetChartProps {
  /** `net_cents` = income − spending for the month, from rust-core. */
  months: { label: string; net_cents: number; in_progress: boolean }[];
  summary: string;
}

const NET_HALF_HEIGHT = 64;

/** Saved (above the line, green) or overspent (below, red) per month. */
export function NetChart({ months, summary }: NetChartProps) {
  const max = Math.max(...months.map((m) => Math.abs(m.net_cents)), 1);
  const height = (cents: number) => (cents === 0 ? 0 : Math.max(2, (Math.abs(cents) / max) * NET_HALF_HEIGHT));
  const hasNegative = months.some((m) => m.net_cents < 0);
  const labels = useColumnLabels(months.length);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary} style={[styles.chart, { gap: 10 }]}>
      <View onLayout={labels.onLayout} style={styles.netPlot}>
        {months.map((m, index) => {
          const saved = m.net_cents >= 0;
          return (
            <View key={index} style={[styles.monthColumn, labels.column]}>
              <View style={styles.netHalf}>
                {saved && <View style={[styles.netBar, styles.netUp, styles.saved, m.in_progress && styles.inProgress, { height: height(m.net_cents) }]} />}
              </View>
              <View style={styles.netBaseline} />
              <View style={[styles.netHalf, styles.netHalfDown]}>
                {!saved && <View style={[styles.netBar, styles.netDown, styles.overspent, m.in_progress && styles.inProgress, { height: height(m.net_cents) }]} />}
              </View>
              <ColumnLabel text={m.label} shown={labels.shown(index)} />
            </View>
          );
        })}
      </View>
      <Legend
        items={[
          { label: 'Saved', swatch: styles.saved },
          ...(hasNegative ? [{ label: 'Overspent', swatch: styles.overspent }] : []),
          { label: 'Month in progress', swatch: [styles.saved, styles.inProgress] },
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

const styles = themed(() => ({
  primary: { color: color.content.primary },
  secondary: { color: color.content.secondary },
  flex: { flex: 1 },
  chart: { gap: spacing[8], alignSelf: 'stretch' },
  plot: { flexDirection: 'row', alignItems: 'flex-end', overflow: 'hidden' },
  // Columns share the width equally; bars take a share of their column, capped at the design width.
  column: { flex: 1, minWidth: 0, alignItems: 'center', gap: 6 },
  columnLabel: { textAlign: 'center' },
  spendingBar: { width: '62%', maxWidth: 36, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  actualBar: { backgroundColor: color.brand.primary },
  predictedBar: {
    backgroundColor: color.feedback.infoSubtle,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.finance.predicted,
  },
  thinDashed: { borderWidth: 1 },
  monthColumn: { flex: 1, minWidth: 0, alignItems: 'center', gap: 6 },
  barPair: { width: '72%', maxWidth: 31, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  pairBar: { flex: 1, maxWidth: 14, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  income: { backgroundColor: color.finance.remaining },
  expense: { backgroundColor: color.finance.spending },
  inProgress: { opacity: 0.4 },
  netPlot: { flexDirection: 'row', alignItems: 'flex-start' },
  netHalf: { alignSelf: 'stretch', height: NET_HALF_HEIGHT, justifyContent: 'flex-end', alignItems: 'center' },
  netHalfDown: { justifyContent: 'flex-start' },
  netBaseline: { alignSelf: 'stretch', height: 1, backgroundColor: color.border.default },
  netBar: { width: '55%', maxWidth: 18 },
  netUp: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  netDown: { borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  saved: { backgroundColor: color.finance.remaining },
  overspent: { backgroundColor: color.finance.overBudget },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  breakdown: { gap: 14 },
  breakdownRow: { gap: 6 },
  breakdownTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  percent: { width: 40, textAlign: 'right' },
}));

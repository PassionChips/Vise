import { TrendingDown, TrendingUp } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ScrollView, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { Card } from '../../src/components/Card';
import { CategoryBreakdown, IncomeExpenseChart, NetChart, SpendingChart } from '../../src/components/Charts';
import { FilterChipRow, SegmentedControl } from '../../src/components/Controls';
import { Screen, TopAppBar } from '../../src/components/Layout';
import { EmptyState, ErrorView, LoadingView } from '../../src/components/QueryState';
import { useCoreQuery } from '../../src/data/store';
import { currentMonth, formatMoney, formatSignedPercent, monthLabel, monthShort, shiftMonth } from '../../src/format';
import {
  getCategoryBreakdown,
  getMonthlySummary,
  getSettings,
  listCategories,
  predictSpending,
} from '../../src/services/viseCore';
import type {
  CategoryBreakdown as CategoryBreakdownRow,
  ExpenseCategory,
  MonthlySummary,
  Prediction,
} from '../../src/services/types';
import { color, spacing, themed, type } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

const RANGES = ['3M', '6M', '12M'] as const;
const RANGE_MONTHS = { '3M': 3, '6M': 6, '12M': 12 } as const;

/** Which graph the main chart card shows. "Income vs expenses" is the default. */
const CHARTS = ['Income vs expenses', 'Spending trend', 'Net savings'] as const;
/** Short labels so all three segments fit on a phone; the heading shows the full name. */
const CHART_TABS = ['Income', 'Spending', 'Net savings'] as const;
type ChartTab = (typeof CHART_TABS)[number];

export default function ReportsScreen() {
  useTheme();
  const [range, setRange] = useState<(typeof RANGES)[number]>('6M');
  const month = currentMonth();

  const report = useCoreQuery(async () => {
    const settings = await getSettings();
    const count = RANGE_MONTHS[range];
    const months = Array.from({ length: count }, (_, i) => shiftMonth(month, i - (count - 1)));
    const [summaries, breakdown, categories, prediction] = await Promise.all([
      Promise.all(months.map((m) => getMonthlySummary(m, settings.currency))),
      getCategoryBreakdown(month, settings.currency),
      listCategories(),
      // Full-month estimate for the month in progress, from the months before it.
      predictSpending(month, settings.currency),
    ]);
    return { currency: settings.currency, summaries, breakdown, categories, prediction };
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
  prediction: Prediction;
}

function ReportBody({ month, currency, summaries, breakdown, categories, prediction }: ReportData & { month: string }) {
  // Income vs expenses (index 0) is the default chart.
  const [chartIndex, setChartIndex] = useState(0);
  const [pageWidth, setPageWidth] = useState(0);
  const pager = useRef<ScrollView>(null);

  const showChart = (index: number) => {
    setChartIndex(index);
    pager.current?.scrollTo({ x: index * pageWidth, animated: true });
  };
  const onSwipeEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!pageWidth) return;
    const index = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setChartIndex(Math.max(0, Math.min(CHARTS.length - 1, index)));
  };
  const onPagerLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width && width !== pageWidth) {
      setPageWidth(width);
      // Keep the current chart in view after a resize or rotation.
      requestAnimationFrame(() => pager.current?.scrollTo({ x: chartIndex * width, animated: false }));
    }
  };
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
        <SegmentedControl
          stretch
          accessibilityLabel="Chart"
          options={CHART_TABS}
          value={CHART_TABS[chartIndex]}
          onChange={(tab: ChartTab) => showChart(CHART_TABS.indexOf(tab))}
        />
        <Text accessibilityRole="header" style={[type.headingMedium, styles.primary]}>{CHARTS[chartIndex]}</Text>
        {/* Swipe left/right between the charts; the segments above jump straight to one. */}
        <View onLayout={onPagerLayout}>
          <ScrollView
            ref={pager}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onSwipeEnd}
            scrollEventThrottle={16}
          >
            {[
              <IncomeExpenseChart key="income" months={chartMonths} summary={`${headline}. ${detail}`} />,
              <SpendingTrend key="spending" summaries={summaries} prediction={prediction} money={money} month={month} />,
              <NetChart
                key="net"
                months={summaries.map((s, i) => ({ label: monthShort(s.month), net_cents: s.net_cents, in_progress: i === summaries.length - 1 }))}
                summary={netSummary(summaries, money)}
              />,
            ].map((page, index) => (
              <View
                key={CHARTS[index]}
                style={[styles.page, { width: pageWidth || undefined }]}
                // Only the visible chart is read out by screen readers.
                importantForAccessibility={index === chartIndex ? 'auto' : 'no-hide-descendants'}
                accessibilityElementsHidden={index !== chartIndex}
              >
                {page}
              </View>
            ))}
          </ScrollView>
        </View>
        <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {CHARTS.map((name, index) => (
            <View key={name} style={[styles.dot, index === chartIndex && styles.dotActive]} />
          ))}
        </View>
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

/** Monthly spending, with the in-progress month's full-month estimate beside it. */
function SpendingTrend({
  summaries,
  prediction,
  money,
  month,
}: {
  summaries: MonthlySummary[];
  prediction: Prediction;
  money: (cents: number, whole?: boolean) => string;
  month: string;
}) {
  const bars = summaries.map((s) => ({ label: monthShort(s.month), spent_cents: s.spent_cents, predicted: false }));
  const hasEstimate = prediction.method !== 'no_data';
  if (hasEstimate) bars.push({ label: 'Est.', spent_cents: prediction.predicted_spent_cents, predicted: true });
  const basis =
    prediction.method === 'linear_regression' ? 'the trend of' : prediction.method === 'average' ? 'the average of' : '';
  const summary = hasEstimate
    ? `${monthLabel(month)} is on course for about ${money(prediction.predicted_spent_cents, true)} of spending, based on ${basis} the last ${prediction.months_used} ${prediction.months_used === 1 ? 'month' : 'months'}.`
    : 'Not enough history yet to estimate this month’s spending.';
  return (
    <>
      <SpendingChart weeks={bars} summary={summary} />
      <Text style={[type.bodySmall, styles.secondary]}>{summary}</Text>
    </>
  );
}

/** One-sentence text alternative for the net savings chart. */
function netSummary(summaries: MonthlySummary[], money: (cents: number, whole?: boolean) => string): string {
  const overspent = summaries.filter((s) => s.net_cents < 0).length;
  const best = summaries.reduce((a, b) => (b.net_cents > a.net_cents ? b : a), summaries[0]);
  const months = summaries.length === 1 ? 'month' : 'months';
  return overspent === 0
    ? `You saved money in all ${summaries.length} ${months}. Best: ${monthLabel(best.month)}, ${money(best.net_cents)}.`
    : `You spent more than you earned in ${overspent} of ${summaries.length} ${months}. Best: ${monthLabel(best.month)}, ${money(best.net_cents)}.`;
}

const styles = themed(() => ({
  primary: { color: color.content.primary },
  secondary: { color: color.content.secondary },
  flex: { flex: 1 },
  insight: { gap: 6 },
  gap16: { gap: spacing[16] },
  spaceBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  page: { gap: spacing[8] },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.border.default },
  dotActive: { width: 16, backgroundColor: color.brand.primary },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
}));

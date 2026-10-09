import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { Alert } from '../../components/Alert';
import { TertiaryButton } from '../../components/Buttons';
import { Calendar, CalendarLegend, type CalendarInsights } from '../../components/Calendar';
import { Glass } from '../../components/Glass';
import { BottomSheet } from '../../components/Overlays';
import { dailyAllowance, dayTotals, neighbourMonths, periodTotals } from '../../data/calendar';
import { currencyByCode, type CurrencyCode } from '../onboarding/data';
import { formatMoney, monthLabel } from '../../format';
import type { Transaction } from '../../services/types';
import { getMonthlySummary, listTransactions } from '../../services/viseCore';
import { color, spacing, themed, type } from '../../theme/tokens';

interface Props {
  visible: boolean;
  /** The month the transactions screen is showing; the calendar opens here. */
  month: string;
  selectedDay: string | null;
  currency: string;
  today: string;
  /** A day was tapped: show that day. */
  onPickDay: (date: string) => void;
  /** "Show the whole month" for the month being browsed. */
  onPickMonth: (month: string) => void;
  onClose: () => void;
}

interface MonthData {
  list: Transaction[];
  limit: number | null;
}

/**
 * The calendar view of spending: every day of a month with what was spent, tinted by how heavy the day was. Swipe
 * to any month, or pick a month and year on the wheels. The month you are on and the two beside it are loaded, so
 * swiping shows amounts straight away.
 */
export function CalendarSheet(props: Props) {
  return (
    <BottomSheet visible={props.visible} title="Spending calendar" onClose={props.onClose}>
      {props.visible && <Content {...props} />}
    </BottomSheet>
  );
}

function Content({ month, selectedDay, currency, today, onPickDay, onPickMonth }: Props) {
  const [viewMonth, setViewMonth] = useState(month);
  const [cache, setCache] = useState<Record<string, MonthData>>({});
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(new Set<string>());
  const symbol = currencyByCode(currency as CurrencyCode)?.symbol ?? currency;

  // Load the month in view and its neighbours, each only once.
  useEffect(() => {
    for (const m of neighbourMonths(viewMonth)) {
      if (requested.current.has(m)) continue;
      requested.current.add(m);
      Promise.all([listTransactions(m), getMonthlySummary(m, currency)])
        .then(([list, summary]) => setCache((c) => ({ ...c, [m]: { list, limit: summary.spending_limit_cents } })))
        .catch((e: unknown) => {
          requested.current.delete(m);
          setError(e instanceof Error ? e.message : 'Could not load this month.');
        });
    }
  }, [viewMonth, currency]);

  const insightsByMonth = useMemo(() => {
    const out: Record<string, CalendarInsights> = {};
    for (const [m, data] of Object.entries(cache)) {
      out[m] = { days: dayTotals(data.list, currency), currency, symbol, allowance: dailyAllowance(data.limit, m) };
    }
    return out;
  }, [cache, currency, symbol]);

  const current = cache[viewMonth];
  const totals = current ? periodTotals(current.list, currency) : null;

  return (
    <View style={styles.body}>
      <Calendar
        month={viewMonth}
        onMonthChange={setViewMonth}
        selected={selectedDay}
        today={today}
        onSelect={onPickDay}
        insightsByMonth={insightsByMonth}
      />
      {error && !current && <Alert type="error" title="Couldn’t load this month" description={error} />}
      {!current && !error && <ActivityIndicator color={color.brand.primary} />}
      <CalendarLegend hasAllowance={insightsByMonth[viewMonth]?.allowance != null} />

      <Glass style={styles.totals} intensity={30}>
        <Total label="Income" value={totals ? formatMoney(totals.income, { currency }) : '–'} tone="income" />
        <Total label="Spent" value={totals ? formatMoney(totals.spent, { currency }) : '–'} />
        <Total label="Net" value={totals ? formatMoney(totals.net, { sign: 'always', currency }) : '–'} tone={totals && totals.net < 0 ? 'over' : 'income'} />
      </Glass>
      <TertiaryButton label={`Show all of ${monthLabel(viewMonth)}`} size="large" onPress={() => onPickMonth(viewMonth)} />
    </View>
  );
}

function Total({ label, value, tone }: { label: string; value: string; tone?: 'income' | 'over' }) {
  const valueColor = tone === 'income' ? color.finance.remaining : tone === 'over' ? color.finance.overBudget : color.content.primary;
  return (
    <View style={styles.total} accessible accessibilityLabel={`${label}, ${value}`}>
      <Text style={[type.label, { color: color.content.secondary }]}>{label.toUpperCase()}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[type.numericSmall, { color: valueColor }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = themed(() => ({
  body: { gap: spacing[8], paddingBottom: spacing[8] },
  totals: { flexDirection: 'row', padding: spacing[12], gap: spacing[8], marginTop: spacing[4] },
  total: { flex: 1, alignItems: 'center', gap: 2 },
}));

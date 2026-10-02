import { Plus, SlidersHorizontal } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { IconButton } from '../../src/components/Buttons';
import { FilterChipRow, SearchInput } from '../../src/components/Controls';
import { TransactionList, TransactionRow } from '../../src/components/FinanceCards';
import { Screen, ScreenHeader } from '../../src/components/Layout';
import { DEMO_TODAY, summary, transactions, type DemoTransaction } from '../../src/data/demo';
import { formatDayHeader, formatMoney } from '../../src/format';
import { color, spacing, type } from '../../src/theme/tokens';

const FILTERS = ['All', 'Expenses', 'Income'] as const;
type Filter = (typeof FILTERS)[number];

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function groupByDay(list: DemoTransaction[]): { date: string; items: DemoTransaction[]; total: number }[] {
  const days = new Map<string, DemoTransaction[]>();
  for (const t of list) {
    days.set(t.date, [...(days.get(t.date) ?? []), t]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, items, total: items.reduce((sum, t) => sum + t.amount_cents, 0) }));
}

export default function TransactionsScreen() {
  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');
  const search = useDebounced(query.trim().toLowerCase(), 250);

  const days = useMemo(() => {
    const matching = transactions.filter((t) => {
      if (filter === 'Expenses' && t.amount_cents > 0) return false;
      if (filter === 'Income' && t.amount_cents < 0) return false;
      return !search || `${t.title} ${t.category}`.toLowerCase().includes(search);
    });
    return groupByDay(matching);
  }, [filter, search]);

  return (
    <Screen>
      <ScreenHeader title="Transactions" action={<IconButton icon={Plus} accessibilityLabel="Add transaction" filled />} />
      <SearchInput value={query} onChangeText={setQuery} placeholder="Search transactions" />

      <View style={styles.filters}>
        <View style={styles.chips}>
          <FilterChipRow options={FILTERS} value={filter} onChange={setFilter} />
        </View>
        <IconButton icon={SlidersHorizontal} accessibilityLabel="More filters" />
      </View>

      <View style={styles.periodSummary}>
        <Text style={[type.bodySmall, styles.secondary]}>{summary.transaction_count} transactions</Text>
        <View style={styles.totals}>
          <Text style={[type.numericSmall, { color: color.finance.remaining }]}>
            {formatMoney(summary.income_cents, { sign: 'always' })}
          </Text>
          <Text style={[type.numericSmall, { color: color.finance.spending }]}>
            {formatMoney(-summary.spent_cents)}
          </Text>
        </View>
      </View>

      {days.length === 0 && (
        <Text style={[type.bodyMedium, styles.secondary, styles.empty]}>
          {search ? `No transactions match “${query.trim()}”` : 'No transactions'}
        </Text>
      )}

      {days.map((day) => (
        <View key={day.date} style={styles.day}>
          <View style={styles.dayHeader}>
            <Text style={[type.label, styles.secondary]}>{formatDayHeader(day.date, DEMO_TODAY)}</Text>
            <Text style={[type.numericSmall, styles.secondary]}>{formatMoney(day.total, { sign: 'always' })}</Text>
          </View>
          <TransactionList>
            {day.items.map((t) => (
              <TransactionRow
                key={t.id}
                title={t.title}
                subtitle={`${t.category} · ${t.detail}`}
                amountCents={t.amount_cents}
                icon={t.icon}
              />
            ))}
          </TransactionList>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  secondary: { color: color.content.secondary },
  filters: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  chips: { flex: 1 },
  periodSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  totals: { flexDirection: 'row', gap: spacing[12] },
  day: { gap: spacing[8] },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  empty: { textAlign: 'center', paddingVertical: spacing[24] },
});

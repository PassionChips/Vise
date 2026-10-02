import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, Plus, SlidersHorizontal } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Alert } from '../../src/components/Alert';
import { IconButton } from '../../src/components/Buttons';
import { FilterChipRow, SearchInput } from '../../src/components/Controls';
import { TransactionList, TransactionRow } from '../../src/components/FinanceCards';
import { Screen, ScreenHeader } from '../../src/components/Layout';
import { ConfirmDialog, Toast } from '../../src/components/Overlays';
import { EmptyState, QueryState } from '../../src/components/QueryState';
import { describeTransaction, signedAmount, useFinance, type FinanceData } from '../../src/data/finance';
import {
  centsToAmount,
  currentMonth,
  formatDayHeader,
  formatMoney,
  formatShortDate,
  isoFromUnix,
  monthLabel,
  shiftMonth,
  todayIso,
} from '../../src/format';
import { addTransaction, deleteTransaction } from '../../src/services/viseCore';
import type { Transaction } from '../../src/services/types';
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

interface Day {
  date: string;
  items: Transaction[];
  total: number;
}

function groupByDay(list: Transaction[]): Day[] {
  const days = new Map<string, Transaction[]>();
  for (const t of list) {
    const date = isoFromUnix(t.occurred_at);
    days.set(date, [...(days.get(date) ?? []), t]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, items, total: items.reduce((sum, t) => sum + signedAmount(t), 0) }));
}

export default function TransactionsScreen() {
  const [month, setMonth] = useState(currentMonth());
  const finance = useFinance(month);

  return (
    <QueryState query={finance}>
      {(data) => <Transactions data={data} month={month} onMonthChange={setMonth} />}
    </QueryState>
  );
}

function Transactions({ data, month, onMonthChange }: { data: FinanceData; month: string; onMonthChange: (m: string) => void }) {
  const { settings, summary, transactions, categories, sources } = data;
  const currency = settings.currency;
  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');
  const search = useDebounced(query.trim().toLowerCase(), 250);
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);
  const [undo, setUndo] = useState<Transaction | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const today = todayIso();

  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => setUndo(null), 5000);
    return () => clearTimeout(id);
  }, [undo]);

  const days = useMemo(() => {
    const matching = transactions.filter((t) => {
      const income = t.transaction_type === 'income' || t.transaction_type === 'refund';
      if (filter === 'Expenses' && income) return false;
      if (filter === 'Income' && !income) return false;
      if (!search) return true;
      const label = describeTransaction(t, categories, sources);
      return `${label.title} ${label.group}`.toLowerCase().includes(search);
    });
    return groupByDay(matching);
  }, [transactions, categories, sources, filter, search]);

  async function confirmDelete() {
    const target = pendingDelete;
    if (!target) return;
    setPendingDelete(null);
    setFailure(null);
    try {
      await deleteTransaction(target.id);
      setUndo(target);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Could not delete the transaction.');
    }
  }

  /** Re-adds the deleted transaction (it gets a new id). */
  async function undoDelete() {
    const t = undo;
    if (!t) return;
    setUndo(null);
    try {
      await addTransaction({
        transaction_type: t.transaction_type,
        amount: centsToAmount(t.amount_cents),
        currency: t.currency,
        description: t.description,
        date: isoFromUnix(t.occurred_at),
        expense_category_id: t.expense_category_id,
        income_source_id: t.income_source_id,
      });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Could not restore the transaction.');
    }
  }

  const deleteMessage = pendingDelete
    ? `${pendingDelete.description} · ${formatMoney(pendingDelete.amount_cents, { currency })} on ${formatShortDate(isoFromUnix(pendingDelete.occurred_at), today)} will be removed and your budgets recalculated. This can’t be undone.`
    : '';

  return (
    <View style={styles.root}>
      <Screen>
        <ScreenHeader title="Transactions" action={<IconButton icon={Plus} accessibilityLabel="Add transaction" filled onPress={() => router.push('/add-transaction')} />} />

        <View style={styles.monthStepper}>
          <IconButton icon={ChevronLeft} accessibilityLabel="Previous month" onPress={() => onMonthChange(shiftMonth(month, -1))} />
          <Text accessibilityRole="header" style={[type.button, styles.primary]}>{monthLabel(data.month)}</Text>
          <IconButton icon={ChevronRight} accessibilityLabel="Next month" onPress={() => onMonthChange(shiftMonth(month, 1))} />
        </View>

        {failure && <Alert type="error" title="That didn’t work" description={failure} />}

        <SearchInput value={query} onChangeText={setQuery} placeholder="Search transactions" />

        <View style={styles.filters}>
          <View style={styles.chips}>
            <FilterChipRow options={FILTERS} value={filter} onChange={setFilter} />
          </View>
          <IconButton icon={SlidersHorizontal} accessibilityLabel="More filters" />
        </View>

        <View style={styles.periodSummary}>
          <Text style={[type.bodySmall, styles.secondary]}>
            {transactions.length} {transactions.length === 1 ? 'transaction' : 'transactions'}
          </Text>
          <View style={styles.totals}>
            <Text style={[type.numericSmall, { color: color.finance.remaining }]}>
              {formatMoney(summary.income_cents, { sign: 'always', currency })}
            </Text>
            <Text style={[type.numericSmall, { color: color.finance.spending }]}>
              {formatMoney(-summary.spent_cents, { currency })}
            </Text>
          </View>
        </View>

        {days.length === 0 && (
          <EmptyState
            title={transactions.length === 0 ? 'No transactions yet' : 'Nothing matches'}
            description={
              transactions.length === 0
                ? `Nothing recorded for ${monthLabel(data.month)}. Tap + to add an expense or income.`
                : search
                  ? `No transactions match “${query.trim()}”.`
                  : 'No transactions of this type this month.'
            }
          />
        )}

        {days.map((day) => (
          <View key={day.date} style={styles.day}>
            <View style={styles.dayHeader}>
              <Text style={[type.label, styles.secondary]}>{formatDayHeader(day.date, today)}</Text>
              <Text style={[type.numericSmall, styles.secondary]}>{formatMoney(day.total, { sign: 'always', currency })}</Text>
            </View>
            <TransactionList>
              {day.items.map((t) => {
                const label = describeTransaction(t, categories, sources);
                return (
                  <TransactionRow
                    key={t.id}
                    title={label.title}
                    subtitle={label.group}
                    amountCents={signedAmount(t)}
                    currency={currency}
                    icon={label.icon}
                    onPress={() => setPendingDelete(t)}
                    onLongPress={() => router.push({ pathname: '/add-transaction', params: { id: String(t.id) } })}
                  />
                );
              })}
            </TransactionList>
          </View>
        ))}
        {transactions.length > 0 && (
          <Text style={[type.bodySmall, styles.secondary, styles.hint]}>Tap a transaction to delete it. Press and hold to edit.</Text>
        )}
      </Screen>

      <ConfirmDialog
        visible={pendingDelete != null}
        title="Delete this transaction?"
        message={deleteMessage}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      {undo && <Toast message="Transaction deleted" actionLabel="Undo" onAction={undoDelete} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  primary: { color: color.content.primary },
  secondary: { color: color.content.secondary },
  monthStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filters: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  chips: { flex: 1 },
  periodSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  totals: { flexDirection: 'row', gap: spacing[12] },
  day: { gap: spacing[8] },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  hint: { textAlign: 'center' },
});

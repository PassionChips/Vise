import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, Plus, SlidersHorizontal } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { Alert } from '../../src/components/Alert';
import { IconButton, PrimaryButton, TertiaryButton } from '../../src/components/Buttons';
import { FilterChip, FilterChipRow, SearchInput } from '../../src/components/Controls';
import { TransactionList, TransactionRow } from '../../src/components/FinanceCards';
import { Screen, ScreenHeader } from '../../src/components/Layout';
import { BottomSheet, ConfirmDialog, Toast } from '../../src/components/Overlays';
import { EmptyState, QueryState } from '../../src/components/QueryState';
import { describeTransaction, signedAmount, useFinance, type FinanceData } from '../../src/data/finance';
import {
  activeFilterCount,
  applyTransactionFilters,
  DEFAULT_FILTERS,
  groupsByDay,
  SORT_LABELS,
  SORT_ORDERS,
  toggle,
  TYPE_FILTERS,
  type TransactionFilters,
} from '../../src/data/transactionFilters';
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
import type { ExpenseCategory, IncomeSource, Transaction } from '../../src/services/types';
import { color, spacing, themed, type } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

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

/** Groups an already sorted list by day, keeping its order. */
function groupByDay(list: Transaction[]): Day[] {
  const days = new Map<string, Transaction[]>();
  for (const t of list) {
    const date = isoFromUnix(t.occurred_at);
    days.set(date, [...(days.get(date) ?? []), t]);
  }
  return [...days.entries()].map(([date, items]) => ({ date, items, total: items.reduce((sum, t) => sum + signedAmount(t), 0) }));
}

export default function TransactionsScreen() {
  useTheme();
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
  const [filters, setFilters] = useState<TransactionFilters>(DEFAULT_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
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

  const matching = useMemo(
    () =>
      applyTransactionFilters(transactions, filters, search, (t) => {
        const label = describeTransaction(t, categories, sources);
        return `${label.title} ${label.group}`;
      }),
    [transactions, categories, sources, filters, search],
  );
  const byDay = groupsByDay(filters.sort);
  const days = useMemo(() => (byDay ? groupByDay(matching) : []), [byDay, matching]);
  const extraFilters = activeFilterCount(filters);
  const filtered = matching.length !== transactions.length;

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
            <FilterChipRow options={TYPE_FILTERS} value={filters.type} onChange={(type) => setFilters((f) => ({ ...f, type }))} />
          </View>
          <View>
            <IconButton
              icon={SlidersHorizontal}
              accessibilityLabel={extraFilters ? `More filters, ${extraFilters} active` : 'More filters'}
              onPress={() => setSheetOpen(true)}
            />
            {extraFilters > 0 && (
              <View pointerEvents="none" style={styles.badge}>
                <Text style={[type.label, styles.badgeText]}>{extraFilters}</Text>
              </View>
            )}
          </View>
        </View>

        {extraFilters > 0 && (
          <View style={styles.activeFilters}>
            <Text numberOfLines={1} style={[type.bodySmall, styles.secondary, styles.flex]}>
              {describeActiveFilters(filters, categories, sources)}
            </Text>
            <TertiaryButton label="Clear" onPress={() => setFilters((f) => ({ ...DEFAULT_FILTERS, type: f.type }))} />
          </View>
        )}

        <View style={styles.periodSummary}>
          <Text style={[type.bodySmall, styles.secondary]}>
            {filtered ? `${matching.length} of ` : ''}
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

        {matching.length === 0 && (
          <EmptyState
            title={transactions.length === 0 ? 'No transactions yet' : 'Nothing matches'}
            description={
              transactions.length === 0
                ? `Nothing recorded for ${monthLabel(data.month)}. Tap + to add an expense or income.`
                : search
                  ? `No transactions match “${query.trim()}”. Try a shorter word, or check the filters.`
                  : 'No transactions match these filters this month.'
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
        {!byDay && matching.length > 0 && (
          <View style={styles.day}>
            <View style={styles.dayHeader}>
              <Text style={[type.label, styles.secondary]}>{SORT_LABELS[filters.sort].toUpperCase()}</Text>
            </View>
            <TransactionList>
              {matching.map((t) => {
                const label = describeTransaction(t, categories, sources);
                return (
                  <TransactionRow
                    key={t.id}
                    title={label.title}
                    subtitle={`${label.group} · ${formatShortDate(isoFromUnix(t.occurred_at), today)}`}
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
        )}
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
      <FilterSheet
        visible={sheetOpen}
        filters={filters}
        categories={categories}
        sources={sources}
        transactions={transactions}
        onApply={(next) => {
          setFilters(next);
          setSheetOpen(false);
        }}
        onClose={() => setSheetOpen(false)}
      />
      {undo && <Toast message="Transaction deleted" actionLabel="Undo" onAction={undoDelete} />}
    </View>
  );
}

/** e.g. "Largest amount · Groceries, Transport · Salary". */
function describeActiveFilters(filters: TransactionFilters, categories: ExpenseCategory[], sources: IncomeSource[]): string {
  const name = <T extends { id: number; name: string }>(list: T[], id: number | null, none: string) =>
    id === null ? none : (list.find((x) => x.id === id)?.name ?? none);
  const parts = [
    filters.sort !== DEFAULT_FILTERS.sort ? SORT_LABELS[filters.sort] : null,
    filters.categoryIds.map((id) => name(categories, id, 'Uncategorised')).join(', ') || null,
    filters.sourceIds.map((id) => name(sources, id, 'No source')).join(', ') || null,
  ];
  return parts.filter(Boolean).join(' · ');
}

interface FilterSheetProps {
  visible: boolean;
  filters: TransactionFilters;
  categories: ExpenseCategory[];
  sources: IncomeSource[];
  transactions: Transaction[];
  onApply: (filters: TransactionFilters) => void;
  onClose: () => void;
}

/** "More filters": sort order, expense categories and income sources. Applies on "Show". */
function FilterSheet({ visible, filters, categories, sources, transactions, onApply, onClose }: FilterSheetProps) {
  const [draft, setDraft] = useState(filters);
  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const hasUncategorised = transactions.some((t) => t.transaction_type !== 'income' && t.expense_category_id === null);
  const hasNoSource = transactions.some((t) => t.transaction_type === 'income' && t.income_source_id === null);
  const categoryChoices: { id: number | null; name: string }[] = [
    ...categories.map((c) => ({ id: c.id, name: c.name })),
    ...(hasUncategorised ? [{ id: null, name: 'Uncategorised' }] : []),
  ];
  const sourceChoices: { id: number | null; name: string }[] = [
    ...sources.map((x) => ({ id: x.id, name: x.name })),
    ...(hasNoSource ? [{ id: null, name: 'No source' }] : []),
  ];
  const resultCount = applyTransactionFilters(transactions, draft, '', () => '').length;

  return (
    <BottomSheet visible={visible} title="Filters" onClose={onClose}>
      <View style={styles.sheet}>
        <Text accessibilityRole="header" style={[type.label, styles.secondary]}>SORT BY</Text>
        <View style={styles.chipWrap}>
          {SORT_ORDERS.map((order) => (
            <FilterChip key={order} label={SORT_LABELS[order]} selected={draft.sort === order} onPress={() => setDraft((d) => ({ ...d, sort: order }))} />
          ))}
        </View>

        {draft.type !== 'Income' && categoryChoices.length > 0 && (
          <>
            <Text accessibilityRole="header" style={[type.label, styles.secondary]}>CATEGORIES</Text>
            <View style={styles.chipWrap}>
              {categoryChoices.map((c) => (
                <FilterChip
                  key={c.id ?? 'none'}
                  label={c.name}
                  selected={draft.categoryIds.includes(c.id)}
                  onPress={() => setDraft((d) => ({ ...d, categoryIds: toggle(d.categoryIds, c.id) }))}
                />
              ))}
            </View>
          </>
        )}

        {draft.type !== 'Expenses' && sourceChoices.length > 0 && (
          <>
            <Text accessibilityRole="header" style={[type.label, styles.secondary]}>INCOME SOURCES</Text>
            <View style={styles.chipWrap}>
              {sourceChoices.map((x) => (
                <FilterChip
                  key={x.id ?? 'none'}
                  label={x.name}
                  selected={draft.sourceIds.includes(x.id)}
                  onPress={() => setDraft((d) => ({ ...d, sourceIds: toggle(d.sourceIds, x.id) }))}
                />
              ))}
            </View>
          </>
        )}

        <View style={styles.sheetActions}>
          <TertiaryButton label="Reset" size="large" onPress={() => setDraft({ ...DEFAULT_FILTERS, type: draft.type })} />
          <PrimaryButton
            label={resultCount === 1 ? 'Show 1 transaction' : `Show ${resultCount} transactions`}
            style={styles.flex}
            onPress={() => onApply(draft)}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = themed(() => ({
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
  flex: { flex: 1 },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.brand.primary,
  },
  badgeText: { color: color.content.onBrand, fontSize: 11, lineHeight: 14 },
  activeFilters: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  sheet: { gap: spacing[12], paddingBottom: spacing[8] },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
  sheetActions: { flexDirection: 'row', alignItems: 'center', gap: spacing[8], marginTop: spacing[8] },
}));

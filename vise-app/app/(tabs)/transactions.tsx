import { router, useIsFocused } from 'expo-router';
import { CalendarDays, ChevronDown, Plus, SlidersHorizontal, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  Text,
  View,
  type CellRendererProps,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import ReAnimated, { FadeIn } from 'react-native-reanimated';

import { Alert } from '../../src/components/Alert';
import { IconButton, PrimaryButton, TertiaryButton } from '../../src/components/Buttons';
import { FilterChip, FilterChipRow, SearchInput } from '../../src/components/Controls';
import { TransactionList, TransactionRow } from '../../src/components/FinanceCards';
import { Glass } from '../../src/components/Glass';
import { BottomSheet, ConfirmDialog, Toast } from '../../src/components/Overlays';
import { EmptyState, QueryState } from '../../src/components/QueryState';
import { dayAtOffset, dayLabel, monthOf, periodTotals } from '../../src/data/calendar';
import { setSavedTransactionDate, useSavedTransactionDate } from '../../src/data/savedTransaction';
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
import { BalanceBlock } from '../../src/features/transactions/BalanceBlock';
import { CalendarSheet } from '../../src/features/transactions/CalendarSheet';
import { CollapsingHeader } from '../../src/features/transactions/CollapsingHeader';
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

type Row = { kind: 'day'; day: Day } | { kind: 'sorted'; items: Transaction[] };

export default function TransactionsScreen() {
  useTheme();
  const [month, setMonth] = useState(currentMonth());
  // A single day inside the month (from the calendar), or null for the whole month.
  const [day, setDay] = useState<string | null>(null);
  const finance = useFinance(month);

  return (
    <View style={styles.screen}>
      <QueryState query={finance}>
        {(data) => (
          <Transactions
            data={data}
            month={month}
            day={day}
            onMonth={(next) => {
              setMonth(next);
              setDay(null);
            }}
            onDay={(date) => {
              setMonth(monthOf(date));
              setDay(date);
            }}
            onClearDay={() => setDay(null)}
          />
        )}
      </QueryState>
    </View>
  );
}

interface TransactionsProps {
  data: FinanceData;
  month: string;
  day: string | null;
  onMonth: (month: string) => void;
  onDay: (date: string) => void;
  onClearDay: () => void;
}

function Transactions({ data, month, day, onMonth, onDay, onClearDay }: TransactionsProps) {
  const { settings, summary, transactions, categories, sources } = data;
  const currency = settings.currency;
  const [filters, setFilters] = useState<TransactionFilters>(DEFAULT_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [query, setQuery] = useState('');
  const search = useDebounced(query.trim().toLowerCase(), 250);
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);
  const [undo, setUndo] = useState<Transaction | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // The header floats over the list and is pinned; the list is padded by its height so the first row starts
  // below it. Scrolling slides its top part away (see CollapsingHeader); the numbers never change with scroll.
  const scrollY = useRef(new Animated.Value(0)).current;
  const [geometry, setGeometry] = useState({ header: 340, top: 180 });
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;
  const rowOffsets = useRef<number[]>([]);
  const [stickyDay, setStickyDay] = useState<string | null>(null);
  const today = todayIso();

  // A transaction saved under a date outside this month: say where it went, and offer to go there.
  const savedDate = useSavedTransactionDate();
  const focused = useIsFocused();
  const elsewhere = savedDate != null && monthOf(savedDate) !== month;
  useEffect(() => {
    if (savedDate == null) return;
    if (!elsewhere) {
      setSavedTransactionDate(null);
      return;
    }
    if (!focused) return; // the clock starts when the user can see the message
    const id = setTimeout(() => setSavedTransactionDate(null), 6000);
    return () => clearTimeout(id);
  }, [savedDate, elsewhere, focused]);

  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => setUndo(null), 5000);
    return () => clearTimeout(id);
  }, [undo]);

  // The chosen day first (by the date each transaction happened), then the search and filters.
  const inPeriod = useMemo(
    () => (day ? transactions.filter((t) => isoFromUnix(t.occurred_at) === day) : transactions),
    [transactions, day],
  );
  const matching = useMemo(
    () =>
      applyTransactionFilters(inPeriod, filters, search, (t) => {
        const label = describeTransaction(t, categories, sources);
        return `${label.title} ${label.group}`;
      }),
    [inPeriod, categories, sources, filters, search],
  );
  const byDay = groupsByDay(filters.sort);
  const rows: Row[] = useMemo(
    () => (matching.length === 0 ? [] : byDay ? groupByDay(matching).map((d): Row => ({ kind: 'day', day: d })) : [{ kind: 'sorted', items: matching }]),
    [matching, byDay],
  );
  const rowsRef = useRef<Row[]>(rows);
  rowsRef.current = rows;
  useEffect(() => {
    rowOffsets.current = [];
    setStickyDay(null);
  }, [rows]);

  // Scroll drives the header natively; this listener only works out which day is under it, for the day label.
  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
        listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
          const y = event.nativeEvent.contentOffset.y;
          const { header, top } = geometryRef.current;
          if (y <= top) {
            setStickyDay((current) => (current === null ? current : null));
            return;
          }
          const line = y + (header - top); // where the compact header ends, in list coordinates
          const current = dayAtOffset(
            rowsRef.current.flatMap((row, index) => (row.kind === 'day' ? [{ date: row.day.date, offset: rowOffsets.current[index] }] : [])),
            line,
          );
          setStickyDay((previous) => (previous === current ? previous : current));
        },
      }),
    [scrollY],
  );
  // Each day's position in the list, so the label can tell which day is under the header.
  const Cell = useMemo(
    () =>
      function Cell({ index, onLayout, style, children }: CellRendererProps<Row>) {
        return (
          <View
            style={style}
            onLayout={(event) => {
              rowOffsets.current[index] = event.nativeEvent.layout.y;
              onLayout?.(event);
            }}
          >
            {children}
          </View>
        );
      },
    [],
  );
  const extraFilters = activeFilterCount(filters);
  // The whole month uses rust-core's totals. A chosen day, a search or a filter narrows what is shown, so the
  // numbers narrow with it (same rules, computed from exactly the rows listed).
  const narrowed = day != null || matching.length !== transactions.length;
  const totals = narrowed
    ? periodTotals(matching, currency)
    : { income: summary.income_cents, spent: summary.spent_cents, net: summary.income_cents - summary.spent_cents, count: transactions.length };
  const periodName = day ? dayLabel(day) : monthLabel(data.month);

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

  const renderTransaction = (t: Transaction, withDate: boolean) => {
    const label = describeTransaction(t, categories, sources);
    return (
      <TransactionRow
        key={t.id}
        title={label.title}
        subtitle={withDate ? `${label.group} · ${formatShortDate(isoFromUnix(t.occurred_at), today)}` : label.group}
        amountCents={signedAmount(t)}
        currency={currency}
        icon={label.icon}
        onPress={() => setPendingDelete(t)}
        onLongPress={() => router.push({ pathname: '/add-transaction', params: { id: String(t.id) } })}
      />
    );
  };

  const addForDay = () => router.push({ pathname: '/add-transaction', params: day ? { date: day } : {} });

  const periodLabel = day ? dayLabel(day) : monthLabel(data.month);
  const stickyRow = stickyDay ? rows.find((row) => row.kind === 'day' && row.day.date === stickyDay) : undefined;
  const chipOpacity = scrollY.interpolate({ inputRange: [geometry.top, geometry.top + 28], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    <View style={styles.root}>
      <Animated.FlatList
        data={rows}
        keyExtractor={(row) => (row.kind === 'day' ? row.day.date : 'sorted')}
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingTop: geometry.header + spacing[12] }]}
        scrollIndicatorInsets={{ top: geometry.header - geometry.top }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        CellRendererComponent={Cell}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={8}
        ListHeaderComponent={failure ? <Alert type="error" title="That didn’t work" description={failure} /> : null}
        renderItem={({ item }) =>
          item.kind === 'day' ? (
            <View style={styles.day}>
              <View style={styles.dayHeader}>
                <Text style={[type.label, styles.secondary]}>{formatDayHeader(item.day.date, today)}</Text>
                <Text style={[type.numericSmall, styles.secondary]}>{formatMoney(item.day.total, { sign: 'always', currency })}</Text>
              </View>
              <TransactionList>{item.day.items.map((t) => renderTransaction(t, false))}</TransactionList>
            </View>
          ) : (
            <View style={styles.day}>
              <View style={styles.dayHeader}>
                <Text style={[type.label, styles.secondary]}>{SORT_LABELS[filters.sort].toUpperCase()}</Text>
              </View>
              <TransactionList>{item.items.map((t) => renderTransaction(t, true))}</TransactionList>
            </View>
          )
        }
        ListEmptyComponent={
          <EmptyState
            title={transactions.length === 0 ? 'No transactions yet' : day && inPeriod.length === 0 ? `Nothing on ${dayLabel(day)}` : 'Nothing matches'}
            description={
              transactions.length === 0
                ? `Nothing recorded for ${monthLabel(data.month)}. Tap + to add an expense or income.`
                : day && inPeriod.length === 0
                  ? 'No transactions were recorded for this day.'
                  : search
                    ? `No transactions match “${query.trim()}”. Try a shorter word, or check the filters.`
                    : 'No transactions match these filters.'
            }
            action={day && inPeriod.length === 0 ? <TertiaryButton label="Add one for this day" size="large" onPress={addForDay} /> : undefined}
          />
        }
        ListFooterComponent={
          transactions.length > 0 ? (
            <Text style={[type.bodySmall, styles.secondary, styles.hint]}>Tap a transaction to delete it. Press and hold to edit.</Text>
          ) : null
        }
      />

      <CollapsingHeader
        scrollY={scrollY}
        onMeasure={setGeometry}
        top={
          <View>
            <Text accessibilityRole="header" style={[type.headingLarge, styles.primary, styles.title]}>
              Transactions
            </Text>
            <BalanceBlock
              balance={totals.net}
              income={totals.income}
              spent={totals.spent}
              currency={currency}
              periodName={periodLabel}
              onStep={(delta) => onMonth(shiftMonth(month, delta))}
            />
          </View>
        }
        expandedLeft={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${monthLabel(data.month)}. Open spending calendar`}
            onPress={() => setCalendarOpen(true)}
            style={({ pressed }) => [styles.monthButton, pressed && styles.pressed]}
          >
            <Text style={[type.button, styles.primary]}>{monthLabel(data.month)}</Text>
            <ChevronDown size={16} color={color.content.secondary} />
          </Pressable>
        }
        collapsedLeft={
          // Two lines, so it fits beside the buttons on a narrow phone: the balance, then income and expenses.
          <View style={styles.compact} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[type.numericMedium, { color: totals.net < 0 ? color.finance.overBudget : color.content.primary }]}>
              {formatMoney(totals.net, { currency })}
            </Text>
            <View style={styles.compactSplit}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.compactSmall, { color: color.finance.remaining }]}>
                ↓ {formatMoney(totals.income, { currency })}
              </Text>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.compactSmall, styles.primary]}>
                ↑ {formatMoney(totals.spent, { currency })}
              </Text>
            </View>
          </View>
        }
        right={
          <>
            <IconButton icon={CalendarDays} accessibilityLabel="Open spending calendar" onPress={() => setCalendarOpen(true)} />
            <IconButton icon={Plus} accessibilityLabel="Add transaction" filled onPress={addForDay} />
          </>
        }
      >
        <View style={styles.searchRow}>
          <View style={styles.flex}>
            <SearchInput value={query} onChangeText={setQuery} placeholder="Search transactions" />
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
        <FilterChipRow options={TYPE_FILTERS} value={filters.type} onChange={(type) => setFilters((f) => ({ ...f, type }))} />
        <View style={styles.captionRow}>
          <Text style={[type.bodySmall, styles.secondary, styles.flex]}>
            {narrowed ? `${matching.length} of ` : ''}
            {transactions.length} {transactions.length === 1 ? 'transaction' : 'transactions'}
            {extraFilters > 0 ? ` · ${describeActiveFilters(filters, categories, sources)}` : ''}
          </Text>
          {day && (
            <ReAnimated.View entering={FadeIn.duration(150)}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Showing ${dayLabel(day)}. Clear the day filter`}
                onPress={onClearDay}
                style={({ pressed }) => [styles.dayChip, pressed && styles.pressed]}
              >
                <Text style={[type.label, { color: color.brand.primary }]}>{dayLabel(day)}</Text>
                <X size={14} color={color.brand.primary} />
              </Pressable>
            </ReAnimated.View>
          )}
          {extraFilters > 0 && <TertiaryButton label="Clear" onPress={() => setFilters((f) => ({ ...DEFAULT_FILTERS, type: f.type }))} />}
        </View>
      </CollapsingHeader>

      {/* Which day is under the header while you scroll, since the in-list day headers pass beneath it. */}
      {stickyRow?.kind === 'day' && (
        <Animated.View pointerEvents="none" style={[styles.stickyWrap, { top: geometry.header - geometry.top + 6, opacity: chipOpacity }]}>
          <Glass style={styles.sticky} intensity={40}>
            <Text style={[type.label, styles.primary]}>{formatDayHeader(stickyRow.day.date, today)}</Text>
            <Text style={[type.numericSmall, styles.secondary]}>{formatMoney(stickyRow.day.total, { sign: 'always', currency })}</Text>
          </Glass>
        </Animated.View>
      )}

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
        transactions={inPeriod}
        onApply={(next) => {
          setFilters(next);
          setSheetOpen(false);
        }}
        onClose={() => setSheetOpen(false)}
      />
      <CalendarSheet
        visible={calendarOpen}
        month={month}
        selectedDay={day}
        currency={currency}
        today={today}
        onPickDay={(date) => {
          onDay(date);
          setCalendarOpen(false);
        }}
        onPickMonth={(next) => {
          onMonth(next);
          setCalendarOpen(false);
        }}
        onClose={() => setCalendarOpen(false)}
      />
      {undo ? (
        <Toast message="Transaction deleted" actionLabel="Undo" onAction={undoDelete} />
      ) : (
        elsewhere &&
        focused &&
        savedDate && (
          <Toast
            message={`Saved to ${monthLabel(monthOf(savedDate))}`}
            actionLabel="View"
            onAction={() => {
              setSavedTransactionDate(null);
              onMonth(monthOf(savedDate));
            }}
          />
        )
      )}
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
  screen: { flex: 1, backgroundColor: color.surface.background },
  root: { flex: 1 },
  primary: { color: color.content.primary },
  secondary: { color: color.content.secondary },
  pressed: { opacity: 0.7 },
  flex: { flex: 1 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: spacing[24], paddingBottom: spacing[24], gap: spacing[16], flexGrow: 1, width: '100%', maxWidth: 720, alignSelf: 'center' },
  title: { paddingLeft: spacing[8] },
  monthButton: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], minHeight: 44, paddingRight: spacing[12], borderRadius: 12 },
  // minWidth 0 lets these shrink instead of pushing past the buttons beside them.
  compact: { minWidth: 0, justifyContent: 'center' },
  compactSplit: { flexDirection: 'row', gap: spacing[12], minWidth: 0 },
  compactSmall: { flexShrink: 1, minWidth: 0, fontFamily: type.numericSmall.fontFamily, fontSize: 12, lineHeight: 16 },
  captionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[8], minHeight: 28 },
  dayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    minHeight: 32,
    paddingHorizontal: spacing[12],
    borderRadius: 16,
    backgroundColor: color.brand.subtle,
    borderWidth: 1,
    borderColor: color.brand.primary,
  },
  stickyWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  sticky: { flexDirection: 'row', alignItems: 'center', gap: spacing[12], paddingHorizontal: spacing[16], paddingVertical: spacing[8], borderRadius: 18 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  day: { gap: spacing[8] },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  hint: { textAlign: 'center' },
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

import { router } from "expo-router";
import { Plus, SlidersHorizontal } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { IconButton } from "../../src/components/Buttons";
import { FilterChipRow, SearchInput } from "../../src/components/Controls";
import {
  TransactionList,
  TransactionRow,
} from "../../src/components/FinanceCards";
import { ConfirmDialog, Toast } from "../../src/components/Overlays";
import { Screen, ScreenHeader } from "../../src/components/Layout";
import {
  DEMO_TODAY,
  summary,
  transactions as seed,
  type DemoTransaction,
} from "../../src/data/demo";
import {
  formatDayHeader,
  formatMoney,
  formatShortDate,
} from "../../src/format";
import { color, spacing, type } from "../../src/theme/tokens";

const FILTERS = ["All", "Expenses", "Income"] as const;
type Filter = (typeof FILTERS)[number];

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function groupByDay(
  list: DemoTransaction[],
): { date: string; items: DemoTransaction[]; total: number }[] {
  const days = new Map<string, DemoTransaction[]>();
  for (const t of list) {
    days.set(t.date, [...(days.get(t.date) ?? []), t]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({
      date,
      items,
      total: items.reduce((sum, t) => sum + t.amount_cents, 0),
    }));
}

export default function TransactionsScreen() {
  const [filter, setFilter] = useState<Filter>("All");
  const [query, setQuery] = useState("");
  const search = useDebounced(query.trim().toLowerCase(), 250);
  const [items, setItems] = useState(seed);
  const [pendingDelete, setPendingDelete] = useState<DemoTransaction | null>(
    null,
  );
  const [undo, setUndo] = useState<{
    item: DemoTransaction;
    index: number;
  } | null>(null);

  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => setUndo(null), 5000);
    return () => clearTimeout(id);
  }, [undo]);

  function confirmDelete() {
    if (!pendingDelete) return;
    const index = items.findIndex((t) => t.id === pendingDelete.id);
    setItems((list) => list.filter((t) => t.id !== pendingDelete.id));
    setUndo({ item: pendingDelete, index });
    setPendingDelete(null);
  }

  function undoDelete() {
    if (!undo) return;
    setItems((list) => [
      ...list.slice(0, undo.index),
      undo.item,
      ...list.slice(undo.index),
    ]);
    setUndo(null);
  }

  const days = useMemo(() => {
    const matching = items.filter((t) => {
      if (filter === "Expenses" && t.amount_cents > 0) return false;
      if (filter === "Income" && t.amount_cents < 0) return false;
      return (
        !search || `${t.title} ${t.category}`.toLowerCase().includes(search)
      );
    });
    return groupByDay(matching);
  }, [items, filter, search]);

  return (
    <View style={styles.root}>
      <Screen>
        <ScreenHeader
          title="Transactions"
          action={
            <IconButton
              icon={Plus}
              accessibilityLabel="Add transaction"
              filled
              onPress={() => router.push("/add-transaction")}
            />
          }
        />
        <SearchInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search transactions"
        />

        <View style={styles.filters}>
          <View style={styles.chips}>
            <FilterChipRow
              options={FILTERS}
              value={filter}
              onChange={setFilter}
            />
          </View>
          <IconButton
            icon={SlidersHorizontal}
            accessibilityLabel="More filters"
          />
        </View>

        <View style={styles.periodSummary}>
          <Text style={[type.bodySmall, styles.secondary]}>
            {summary.transaction_count} transactions
          </Text>
          <View style={styles.totals}>
            <Text
              style={[type.numericSmall, { color: color.finance.remaining }]}
            >
              {formatMoney(summary.income_cents, { sign: "always" })}
            </Text>
            <Text
              style={[type.numericSmall, { color: color.finance.spending }]}
            >
              {formatMoney(-summary.spent_cents)}
            </Text>
          </View>
        </View>

        {days.length === 0 && (
          <Text style={[type.bodyMedium, styles.secondary, styles.empty]}>
            {search
              ? `No transactions match “${query.trim()}”`
              : "No transactions"}
          </Text>
        )}

        {days.map((day) => (
          <View key={day.date} style={styles.day}>
            <View style={styles.dayHeader}>
              <Text style={[type.label, styles.secondary]}>
                {formatDayHeader(day.date, DEMO_TODAY)}
              </Text>
              <Text style={[type.numericSmall, styles.secondary]}>
                {formatMoney(day.total, { sign: "always" })}
              </Text>
            </View>
            <TransactionList>
              {day.items.map((t) => (
                <TransactionRow
                  key={t.id}
                  title={t.title}
                  subtitle={`${t.category} · ${t.detail}`}
                  amountCents={t.amount_cents}
                  icon={t.icon}
                  onPress={() => setPendingDelete(t)}
                />
              ))}
            </TransactionList>
          </View>
        ))}
      </Screen>
      <ConfirmDialog
        visible={pendingDelete != null}
        title="Delete this transaction?"
        message={
          pendingDelete
            ? `${pendingDelete.title} · ${formatMoney(pendingDelete.amount_cents)} on ${formatShortDate(pendingDelete.date, DEMO_TODAY)} will be removed and your budgets recalculated. This can't be undone.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      {undo && (
        <Toast
          message="Transaction deleted"
          actionLabel="Undo"
          onAction={undoDelete}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  secondary: { color: color.content.secondary },
  filters: { flexDirection: "row", alignItems: "center", gap: spacing[8] },
  chips: { flex: 1 },
  periodSummary: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  totals: { flexDirection: "row", gap: spacing[12] },
  day: { gap: spacing[8] },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  empty: { textAlign: "center", paddingVertical: spacing[24] },
});

import { router } from "expo-router";
import { Calendar, ChevronDown, Plus } from "lucide-react-native";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Alert } from "../../src/components/Alert";
import { IconButton, SecondaryButton } from "../../src/components/Buttons";
import { Card } from "../../src/components/Card";
import { CategoryBudgetCard } from "../../src/components/FinanceCards";
import {
  Screen,
  ScreenHeader,
  SectionHeader,
} from "../../src/components/Layout";
import { Toast } from "../../src/components/Overlays";
import { ProgressBar } from "../../src/components/ProgressBar";
import {
  clearDeletedBudget,
  undoDeleteBudget,
  useBudgets,
} from "../../src/data/budgetStore";
import { month, summary, warningThresholdPercent } from "../../src/data/demo";
import { formatMoney, percentOf } from "../../src/format";
import { color, spacing, type } from "../../src/theme/tokens";

export default function BudgetsScreen() {
  const { budgets, lastDeleted } = useBudgets();

  useEffect(() => {
    if (!lastDeleted) return;
    const id = setTimeout(clearDeletedBudget, 5000);
    return () => clearTimeout(id);
  }, [lastDeleted]);

  const budgetSum = budgets.reduce((n, c) => n + c.limit_cents, 0);
  const spentSum = budgets.reduce((n, c) => n + c.spent_cents, 0);
  const budgetOverview = {
    budget_cents: budgetSum,
    spent_cents: spentSum,
    left_cents: budgetSum - spentSum,
    unbudgeted_spent_cents: Math.max(0, summary.spent_cents - spentSum),
  };

  const byUsage = [...budgets].sort(
    (a, b) => b.spent_cents / b.limit_cents - a.spent_cents / a.limit_cents,
  );
  const over = byUsage.filter((c) => c.spent_cents > c.limit_cents);
  const usedPercent = percentOf(
    budgetOverview.spent_cents,
    budgetOverview.budget_cents,
  );
  const leftColor =
    budgetOverview.left_cents < 0
      ? color.finance.overBudget
      : color.finance.remaining;

  return (
    <View style={styles.root}>
      <Screen>
        <ScreenHeader
          title="Budgets"
          action={
            <IconButton
              icon={Plus}
              accessibilityLabel="Create budget"
              filled
              onPress={() => router.push("/budget-form")}
            />
          }
        />
        <View style={styles.monthPicker}>
          <SecondaryButton
            size="small"
            label={month.label}
            leadingIcon={Calendar}
            trailingIcon={ChevronDown}
            accessibilityLabel={`Month: ${month.label}. Change month`}
          />
        </View>

        <Card style={styles.overview}>
          <View style={styles.headline}>
            <Text style={[type.bodySmall, styles.secondary]}>
              Left to spend this month
            </Text>
            <Text style={[type.numericLarge, { color: leftColor }]}>
              {formatMoney(budgetOverview.left_cents)}
            </Text>
          </View>
          <ProgressBar
            value={
              budgetOverview.budget_cents > 0
                ? budgetOverview.spent_cents / budgetOverview.budget_cents
                : 0
            }
            fillColor={
              usedPercent >= 100
                ? color.finance.overBudget
                : color.finance.underBudget
            }
            accessibilityLabel={`${usedPercent} percent of this month's budget used`}
          />
          <View style={styles.stats}>
            <Stat
              label="Budget"
              value={formatMoney(budgetOverview.budget_cents)}
            />
            <Stat
              label="Spent"
              value={formatMoney(budgetOverview.spent_cents)}
            />
            <Stat label="Used" value={`${usedPercent}%`} />
          </View>
          {budgetOverview.unbudgeted_spent_cents > 0 && (
            <Text style={[type.bodySmall, styles.secondary]}>
              {formatMoney(budgetOverview.unbudgeted_spent_cents)} was spent in
              categories without a budget.
            </Text>
          )}
        </Card>

        {over.map((c) => (
          <Alert
            key={c.category_id}
            type="error"
            title={`${c.name} is ${formatMoney(c.spent_cents - c.limit_cents)} over budget`}
            description={`You have spent ${percentOf(c.spent_cents, c.limit_cents)}% of your ${formatMoney(c.limit_cents)} limit.`}
          />
        ))}

        <View style={styles.sectionHeader}>
          <SectionHeader
            title="By category"
            trailing={
              <Text style={[type.bodySmall, styles.secondary]}>
                Most used first
              </Text>
            }
          />
        </View>

        {byUsage.map((c) => (
          <CategoryBudgetCard
            key={c.category_id}
            name={c.name}
            icon={c.icon}
            spentCents={c.spent_cents}
            limitCents={c.limit_cents}
            warningThreshold={warningThresholdPercent}
            onPress={() =>
              router.push({
                pathname: "/budget-form",
                params: { id: String(c.category_id) },
              })
            }
          />
        ))}
      </Screen>
      {lastDeleted && (
        <Toast
          message="Budget deleted"
          actionLabel="Undo"
          onAction={undoDeleteBudget}
        />
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[type.bodySmall, styles.secondary]}>{label}</Text>
      <Text style={[type.numericSmall, { color: color.content.primary }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  secondary: { color: color.content.secondary },
  monthPicker: { flexDirection: "row" },
  overview: { padding: spacing[20], gap: spacing[16] },
  headline: { gap: 4 },
  stats: { flexDirection: "row", justifyContent: "space-between" },
  stat: { gap: 2 },
  sectionHeader: { paddingTop: spacing[8] },
});

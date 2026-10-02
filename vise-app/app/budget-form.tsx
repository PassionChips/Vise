import { router, useLocalSearchParams } from "expo-router";
import { Trash2, X } from "lucide-react-native";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Alert } from "../src/components/Alert";
import { IconButton, PrimaryButton } from "../src/components/Buttons";
import { categoryIcon } from "../src/components/CategoryIcon";
import { AmountInput, SelectField } from "../src/components/Inputs";
import { ConfirmDialog } from "../src/components/Overlays";
import {
  ALL_CATEGORIES,
  deleteBudget,
  getBudget,
  saveBudget,
  useBudgets,
} from "../src/data/budgetStore";
import { CURRENCY } from "../src/data/demo";
import { formatMoney } from "../src/format";
import { color, spacing, type } from "../src/theme/tokens";

type Errors = { limit?: string; category?: string };

/** Create (no params) or edit (?id=<category id>) a monthly category budget. */
export default function BudgetFormScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = params.id ? Number(params.id) : null;
  const existing = editingId != null ? getBudget(editingId) : undefined;
  const { budgets } = useBudgets();

  const [category, setCategory] = useState<string | null>(
    editingId != null ? String(editingId) : null,
  );
  const [limit, setLimit] = useState(
    existing ? (existing.limit_cents / 100).toFixed(2) : "",
  );
  const [errors, setErrors] = useState<Errors>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const options = ALL_CATEGORIES.filter((c) =>
    existing
      ? c.id === editingId
      : !budgets.some((b) => b.category_id === c.id),
  ).map((c) => ({
    value: String(c.id),
    label: c.name,
    icon: categoryIcon(c.icon),
  }));
  const errorCount = Object.keys(errors).length;

  function save() {
    const next: Errors = {};
    if (!category) next.category = "Choose a category";
    if (!(Number(limit) > 0)) next.limit = "Enter a limit greater than 0";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    saveBudget(Number(category), Math.round(Number(limit) * 100));
    router.back();
  }

  function remove() {
    setConfirmDelete(false);
    deleteBudget(editingId!);
    router.back();
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
      <View style={styles.bar}>
        <View style={styles.barSide} />
        <Text
          accessibilityRole="header"
          style={[type.headingMedium, styles.title]}
        >
          {existing ? "Edit budget" : "New budget"}
        </Text>
        <View style={styles.barSide}>
          <IconButton
            icon={X}
            accessibilityLabel="Close"
            onPress={() => router.back()}
          />
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
        >
          {errorCount > 0 && (
            <Alert
              type="error"
              title={`${errorCount} ${errorCount === 1 ? "thing needs" : "things need"} fixing`}
              description={
                errorCount === 2
                  ? "Choose a category and enter a limit."
                  : errors.limit
                    ? "Enter a limit."
                    : "Choose a category."
              }
            />
          )}
          <SelectField
            label="Category"
            options={options}
            value={category}
            onChange={(v) => {
              setCategory(v);
              setErrors((e) => ({ ...e, category: undefined }));
            }}
            placeholder="Choose a category"
            error={errors.category}
          />
          <AmountInput
            label="Monthly limit"
            currency={CURRENCY}
            currencySymbol="€"
            value={limit}
            onChangeText={(v) => {
              setLimit(v);
              setErrors((e) => ({ ...e, limit: undefined }));
            }}
            helperText="Applies to each month. You can change it any time."
            error={errors.limit}
          />
          {existing && (
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirmDelete(true)}
              style={styles.delete}
            >
              <Trash2 size={20} strokeWidth={2} color={color.feedback.error} />
              <Text style={[type.button, { color: color.feedback.error }]}>
                Delete budget
              </Text>
            </Pressable>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton
            label={existing ? "Save changes" : "Create budget"}
            onPress={save}
          />
        </View>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={confirmDelete}
        title="Delete this budget?"
        message={
          existing
            ? `The ${formatMoney(existing.limit_cents)} limit for ${existing.name} will be removed. Your transactions are not affected.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: color.surface.background },
  bar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[16],
  },
  barSide: { width: 44, alignItems: "flex-end" },
  title: { flex: 1, textAlign: "center", color: color.content.primary },
  form: {
    gap: spacing[16],
    paddingHorizontal: spacing[24],
    paddingTop: spacing[8],
    paddingBottom: spacing[24],
  },
  delete: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[8],
    height: 48,
  },
  footer: { paddingHorizontal: spacing[24], paddingBottom: spacing[16] },
});

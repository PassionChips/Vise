import { router, useLocalSearchParams } from "expo-router";
import { X } from "lucide-react-native";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Alert } from "../src/components/Alert";
import { IconButton, PrimaryButton } from "../src/components/Buttons";
import { SegmentedControl } from "../src/components/Controls";
import { categoryIcon } from "../src/components/CategoryIcon";
import {
  AmountInput,
  DateField,
  NoteField,
  SelectField,
  TextField,
} from "../src/components/Inputs";
import { categoryBudgets, CURRENCY, DEMO_TODAY } from "../src/data/demo";
import { addTransaction, ViseError } from "../src/services/viseCore";
import { color, spacing, type } from "../src/theme/tokens";

const KINDS = ["Expense", "Income"] as const;
type Kind = (typeof KINDS)[number];

const INCOME_SOURCES = ["Salary", "Refund", "Side work", "Other"] as const;

type Errors = { amount?: string; category?: string };

function displayDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `Today, ${d}/${m}/${y}`;
}

export default function AddTransactionScreen() {
  const params = useLocalSearchParams<{ type?: string }>();
  const [kind, setKind] = useState<Kind>(
    params.type === "income" ? "Income" : "Expense",
  );
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const expense = kind === "Expense";
  const options = expense
    ? categoryBudgets.map((c) => ({
        value: String(c.category_id),
        label: c.name,
        icon: categoryIcon(c.icon),
      }))
    : INCOME_SOURCES.map((s) => ({ value: s, label: s }));

  const errorCount = Object.keys(errors).length;

  function validate(): Errors {
    const next: Errors = {};
    if (!(Number(amount) > 0)) next.amount = "Enter an amount greater than 0";
    if (!category)
      next.category = expense ? "Choose a category" : "Choose a source";
    return next;
  }

  async function save() {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      await addTransaction({
        transaction_type: expense ? "expense" : "income",
        amount,
        currency: CURRENCY,
        description: description.trim(),
        date: DEMO_TODAY,
        expense_category_id: expense ? Number(category) : null,
        income_source_id: null,
      });
    } catch (e) {
      // Until the native bridge exists the demo data stays as it is; just leave.
      if (!(e instanceof ViseError && e.kind === "bridge_unavailable")) {
        setErrors({
          amount: e instanceof Error ? e.message : "Could not save",
        });
        setSaving(false);
        return;
      }
    }
    setSaving(false);
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
          {expense ? "Add expense" : "Add income"}
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
          <SegmentedControl
            options={KINDS}
            value={kind}
            onChange={(next) => {
              setKind(next);
              setCategory(null);
              setErrors({});
            }}
            stretch
            accessibilityLabel="Transaction type"
          />

          {errorCount > 0 && (
            <Alert
              type="error"
              title={`${errorCount} ${errorCount === 1 ? "thing needs" : "things need"} fixing`}
              description={
                errorCount === 2
                  ? `Enter an amount and choose a ${expense ? "category" : "source"}.`
                  : errors.amount
                    ? "Enter an amount."
                    : `Choose a ${expense ? "category" : "source"}.`
              }
            />
          )}

          <AmountInput
            label="Amount"
            currency={CURRENCY}
            currencySymbol="€"
            value={amount}
            onChangeText={(v) => {
              setAmount(v);
              if (errors.amount)
                setErrors((e) => ({ ...e, amount: undefined }));
            }}
            error={errors.amount}
          />
          <TextField
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. Tesco Express"
          />
          <SelectField
            label={expense ? "Category" : "Source"}
            options={options}
            value={category}
            onChange={(v) => {
              setCategory(v);
              setErrors((e) => ({ ...e, category: undefined }));
            }}
            placeholder={expense ? "Choose a category" : "Choose a source"}
            error={errors.category}
          />
          <DateField label="Date" displayValue={displayDate(DEMO_TODAY)} />
          <NoteField
            label="Note (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="Add a note"
          />
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton
            label={expense ? "Save expense" : "Save income"}
            loading={saving}
            onPress={save}
          />
        </View>
      </KeyboardAvoidingView>
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
  footer: { paddingHorizontal: spacing[24], paddingBottom: spacing[16] },
});

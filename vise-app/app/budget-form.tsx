import { router, useLocalSearchParams } from 'expo-router';
import { Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Alert } from '../src/components/Alert';
import { IconButton, PrimaryButton } from '../src/components/Buttons';
import { AmountInput, SelectField } from '../src/components/Inputs';
import { ConfirmDialog } from '../src/components/Overlays';
import { QueryState } from '../src/components/QueryState';
import { useFinance, type FinanceData } from '../src/data/finance';
import { categoryOptions, resolveCategory } from '../src/data/pickers';
import { setDeletedBudget } from '../src/data/undo';
import { centsToAmount, currentMonth, formatMoney } from '../src/format';
import { currencyByCode, type CurrencyCode } from '../src/features/onboarding/data';
import { deleteCategoryBudget, setCategoryBudget, ViseError } from '../src/services/viseCore';
import { color, spacing, themed, type } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeProvider';

type Errors = Partial<Record<'limit' | 'category' | 'form', string>>;

const FIELD: Record<string, 'limit' | 'category'> = { limit: 'limit', expense_category_id: 'category' };

/** Create (no params) or edit (?id=<category id>) a monthly category budget. */
export default function BudgetFormScreen() {
  useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const finance = useFinance(currentMonth());
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <QueryState query={finance}>
        {(data) => <Form data={data} editingId={params.id ? Number(params.id) : null} />}
      </QueryState>
    </SafeAreaView>
  );
}

function Form({ data, editingId }: { data: FinanceData; editingId: number | null }) {
  const { month, settings, summary, categories } = data;
  const currency = settings.currency;
  const existing = editingId != null ? summary.categories.find((c) => c.category_id === editingId && c.limit_cents != null) : undefined;

  const [category, setCategory] = useState<string | null>(editingId != null ? String(editingId) : null);
  const [limit, setLimit] = useState(existing?.limit_cents != null ? centsToAmount(existing.limit_cents) : '');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const budgeted = new Set(summary.categories.filter((c) => c.limit_cents != null).map((c) => String(c.category_id)));
  // Editing keeps the one category; creating offers only categories without a budget.
  const options = categoryOptions(categories).filter((o) => (existing ? o.value === String(editingId) : !budgeted.has(o.value)));
  const errorKeys = Object.keys(errors).filter((k) => k !== 'form');
  const symbol = currencyByCode(currency as CurrencyCode)?.symbol ?? currency;

  async function save() {
    const found: Errors = {};
    if (!category) found.category = 'Choose a category';
    if (!(Number(limit) > 0)) found.limit = 'Enter a limit greater than 0';
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      const categoryId = await resolveCategory(category!);
      await setCategoryBudget({ month, currency, expense_category_id: categoryId, limit });
      router.back();
    } catch (error) {
      const field = error instanceof ViseError && error.field ? FIELD[error.field] : undefined;
      const message = error instanceof Error ? error.message : 'Could not save. Try again.';
      setErrors(field ? { [field]: message } : { form: message });
      setSaving(false);
    }
  }

  async function remove() {
    if (!existing || existing.category_id == null || existing.limit_cents == null) return;
    setConfirmDelete(false);
    try {
      await deleteCategoryBudget({ month, currency, expense_category_id: existing.category_id });
      setDeletedBudget({ month, currency, categoryId: existing.category_id, name: existing.name, limitCents: existing.limit_cents });
      router.back();
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : 'Could not delete the budget.' });
    }
  }

  return (
    <>
      <View style={styles.bar}>
        <View style={styles.barSide} />
        <Text accessibilityRole="header" style={[type.headingMedium, styles.title]}>
          {existing ? 'Edit budget' : 'New budget'}
        </Text>
        <View style={styles.barSide}>
          <IconButton icon={X} accessibilityLabel="Close" onPress={() => router.back()} />
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {errors.form && <Alert type="error" title="Couldn’t save" description={errors.form} />}
          {errorKeys.length > 0 && (
            <Alert
              type="error"
              title={`${errorKeys.length} ${errorKeys.length === 1 ? 'thing needs' : 'things need'} fixing`}
              description="Check the highlighted fields below."
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
            currency={currency}
            currencySymbol={symbol}
            value={limit}
            onChangeText={(v) => {
              setLimit(v);
              setErrors((e) => ({ ...e, limit: undefined }));
            }}
            helperText="Applies to this month. You can change it any time."
            error={errors.limit}
          />
          {existing && (
            <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(true)} style={styles.delete}>
              <Trash2 size={20} strokeWidth={2} color={color.feedback.error} />
              <Text style={[type.button, { color: color.feedback.error }]}>Delete budget</Text>
            </Pressable>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton label={existing ? 'Save changes' : 'Create budget'} loading={saving} onPress={save} />
        </View>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={confirmDelete}
        title="Delete this budget?"
        message={
          existing?.limit_cents != null
            ? `The ${formatMoney(existing.limit_cents, { currency })} limit for ${existing.name} will be removed. Your transactions are not affected.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

const styles = themed(() => ({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: color.surface.background },
  bar: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[16] },
  barSide: { width: 44, alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center', color: color.content.primary },
  form: { gap: spacing[16], paddingHorizontal: spacing[24], paddingTop: spacing[8], paddingBottom: spacing[24] },
  delete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[8], height: 48 },
  footer: { paddingHorizontal: spacing[24], paddingBottom: spacing[16] },
}));

import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Alert } from '../src/components/Alert';
import { IconButton, PrimaryButton } from '../src/components/Buttons';
import { SegmentedControl } from '../src/components/Controls';
import { AmountInput, DateField, SelectField, TextField } from '../src/components/Inputs';
import { QueryState } from '../src/components/QueryState';
import { useFinance, type FinanceData } from '../src/data/finance';
import { categoryOptions, resolveCategory, resolveSource, sourceOptions } from '../src/data/pickers';
import { centsToAmount, currentMonth, isoFromUnix, todayIso } from '../src/format';
import { currencyByCode, type CurrencyCode } from '../src/features/onboarding/data';
import { addTransaction, listTransactions, updateTransaction, ViseError } from '../src/services/viseCore';
import type { Transaction } from '../src/services/types';
import { useCoreQuery } from '../src/data/store';
import { color, spacing, themed, type } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeProvider';

const KINDS = ['Expense', 'Income'] as const;
type Kind = (typeof KINDS)[number];

type Errors = Partial<Record<'amount' | 'description' | 'category' | 'date' | 'form', string>>;

/** Maps rust-core's field names to this form's. */
const FIELD: Record<string, keyof Errors> = {
  amount: 'amount',
  description: 'description',
  date: 'date',
  expense_category_id: 'category',
  income_source_id: 'category',
};

function displayDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${iso === todayIso() ? 'Today, ' : ''}${d}/${m}/${y}`;
}

/** Add (no params) or edit (?id=<transaction id>) a transaction. */
export default function AddTransactionScreen() {
  useTheme();
  const params = useLocalSearchParams<{ type?: string; id?: string }>();
  const editingId = params.id ? Number(params.id) : null;
  const finance = useFinance(currentMonth());
  // An edit can target any month, so look the transaction up by id across the stored months.
  const target = useCoreQuery(
    async () => (editingId == null ? null : await findTransaction(editingId)),
    [editingId],
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <QueryState query={finance}>
        {(data) => (
          <QueryState query={target}>
            {(existing) => <Form data={data} existing={existing} initialIncome={params.type === 'income'} />}
          </QueryState>
        )}
      </QueryState>
    </SafeAreaView>
  );
}

/** Finds a transaction by scanning back through recent months. */
async function findTransaction(id: number): Promise<Transaction | null> {
  let month = currentMonth();
  for (let i = 0; i < 24; i += 1) {
    const found = (await listTransactions(month)).find((t) => t.id === id);
    if (found) return found;
    const [y, m] = month.split('-').map(Number);
    month = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  }
  return null;
}

function Form({ data, existing, initialIncome }: { data: FinanceData; existing: Transaction | null; initialIncome: boolean }) {
  const { settings, categories, sources } = data;
  const currency = existing?.currency ?? settings.currency;
  const symbol = currencyByCode(currency as CurrencyCode)?.symbol ?? currency;
  const [kind, setKind] = useState<Kind>(
    existing ? (existing.transaction_type === 'income' ? 'Income' : 'Expense') : initialIncome ? 'Income' : 'Expense',
  );
  const [amount, setAmount] = useState(existing ? centsToAmount(existing.amount_cents) : '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [category, setCategory] = useState<string | null>(
    existing
      ? String(existing.expense_category_id ?? existing.income_source_id ?? '') || null
      : initialIncome && settings.income_source_id != null
        ? String(settings.income_source_id)
        : null,
  );
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const date = existing ? isoFromUnix(existing.occurred_at) : todayIso();

  const expense = kind === 'Expense';
  const options = expense ? categoryOptions(categories) : sourceOptions(sources);
  const errorKeys = Object.keys(errors).filter((k) => k !== 'form');

  // Switching between expense and income clears a choice that belongs to the other list.
  useEffect(() => {
    if (category && !options.some((o) => o.value === category)) setCategory(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  async function save() {
    const found: Errors = {};
    if (!(Number(amount) > 0)) found.amount = 'Enter an amount greater than 0';
    if (!category) found.category = expense ? 'Choose a category' : 'Choose a source';
    if (!description.trim()) found.description = 'Enter a description';
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      const resolved = expense ? await resolveCategory(category!) : await resolveSource(category!);
      const input = {
        transaction_type: expense ? ('expense' as const) : ('income' as const),
        amount,
        currency,
        description: description.trim(),
        date,
        expense_category_id: expense ? resolved : null,
        income_source_id: expense ? null : resolved,
      };
      if (existing) await updateTransaction({ id: existing.id, ...input });
      else await addTransaction(input);
      router.back();
    } catch (error) {
      // Never close the screen on failure: keep what was typed and say what went wrong.
      const field = error instanceof ViseError && error.field ? FIELD[error.field] : undefined;
      const message = error instanceof Error ? error.message : 'Could not save. Try again.';
      setErrors(field ? { [field]: message } : { form: message });
      setSaving(false);
    }
  }

  return (
    <>
      <View style={styles.bar}>
        <View style={styles.barSide} />
        <Text accessibilityRole="header" style={[type.headingMedium, styles.title]}>
          {existing ? 'Edit transaction' : expense ? 'Add expense' : 'Add income'}
        </Text>
        <View style={styles.barSide}>
          <IconButton icon={X} accessibilityLabel="Close" onPress={() => router.back()} />
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <SegmentedControl options={KINDS} value={kind} onChange={setKind} stretch accessibilityLabel="Transaction type" />

          {errors.form && <Alert type="error" title="Couldn’t save" description={errors.form} />}
          {errorKeys.length > 0 && (
            <Alert
              type="error"
              title={`${errorKeys.length} ${errorKeys.length === 1 ? 'thing needs' : 'things need'} fixing`}
              description="Check the highlighted fields below."
            />
          )}

          <AmountInput
            label="Amount"
            currency={currency}
            currencySymbol={symbol}
            value={amount}
            onChangeText={(v) => {
              setAmount(v);
              setErrors((e) => ({ ...e, amount: undefined }));
            }}
            error={errors.amount}
          />
          <TextField
            label="Description"
            value={description}
            onChangeText={(v) => {
              setDescription(v);
              setErrors((e) => ({ ...e, description: undefined }));
            }}
            placeholder="e.g. Tesco Express"
            error={errors.description}
          />
          <SelectField
            label={expense ? 'Category' : 'Source'}
            options={options}
            value={category}
            onChange={(v) => {
              setCategory(v);
              setErrors((e) => ({ ...e, category: undefined }));
            }}
            placeholder={expense ? 'Choose a category' : 'Choose a source'}
            error={errors.category}
          />
          <DateField label="Date" displayValue={displayDate(date)} error={errors.date} />
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton
            label={existing ? 'Save changes' : expense ? 'Save expense' : 'Save income'}
            loading={saving}
            onPress={save}
          />
        </View>
      </KeyboardAvoidingView>
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
  footer: { paddingHorizontal: spacing[24], paddingBottom: spacing[16] },
}));

import { router, useLocalSearchParams } from 'expo-router';
import { Camera, Image as ImageIcon, ScanLine, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Alert } from '../src/components/Alert';
import { IconButton, PrimaryButton, SecondaryButton } from '../src/components/Buttons';
import { SegmentedControl } from '../src/components/Controls';
import { AmountInput, DateField, SelectField, TextField } from '../src/components/Inputs';
import { BottomSheet, SheetAction } from '../src/components/Overlays';
import { QueryState } from '../src/components/QueryState';
import { activeErrors, clearError, fixSummary } from '../src/data/formErrors';
import { useFinance, type FinanceData } from '../src/data/finance';
import { scanReceipt, type ReceiptSource } from '../src/data/receiptScan';
import { ScanNotes } from '../src/features/receipt/ScanNotes';
import { categoryOptions, resolveCategory, resolveSource, sourceOptions } from '../src/data/pickers';
import { centsToAmount, currentMonth, isoFromUnix, todayIso } from '../src/format';
import { currencyByCode, type CurrencyCode } from '../src/features/onboarding/data';
import { addTransaction, listTransactions, updateTransaction, ViseError } from '../src/services/viseCore';
import type { ReceiptScan, Transaction } from '../src/services/types';
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
  const params = useLocalSearchParams<{ type?: string; id?: string; scan?: string }>();
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
            {(existing) => (
              <Form
                data={data}
                existing={existing}
                initialIncome={params.type === 'income'}
                autoScan={params.scan === 'camera' || params.scan === 'library' ? params.scan : undefined}
              />
            )}
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

/** Checks the form. Runs on save and, once the user has tried to save, on every change. */
function validateTransaction(v: { amount: string; category: string | null; description: string; expense: boolean }): Errors {
  const found: Errors = {};
  if (!(Number(v.amount) > 0)) found.amount = 'Enter an amount greater than 0';
  if (!v.category) found.category = v.expense ? 'Choose a category' : 'Choose a source';
  if (!v.description.trim()) found.description = 'Enter a description';
  return found;
}

function Form({
  data,
  existing,
  initialIncome,
  autoScan,
}: {
  data: FinanceData;
  existing: Transaction | null;
  initialIncome: boolean;
  autoScan?: ReceiptSource;
}) {
  const { settings, categories, sources } = data;
  const [currency, setCurrency] = useState(existing?.currency ?? settings.currency);
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
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(existing ? isoFromUnix(existing.occurred_at) : todayIso());
  const [scan, setScan] = useState<ReceiptScan | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanSheet, setScanSheet] = useState(false);

  const expense = kind === 'Expense';
  const options = expense ? categoryOptions(categories) : sourceOptions(sources);
  const fixing = activeErrors(errors);
  const fieldLabels: Record<string, string> = {
    amount: 'Amount',
    description: 'Description',
    category: expense ? 'Category' : 'Source',
    date: 'Date',
  };
  const banner = fixSummary(fixing.map((key) => fieldLabels[key] ?? key));

  // After a first attempt to save, keep the messages in step with what is typed: a field is
  // highlighted while it is wrong and its message disappears as soon as it is right.
  useEffect(() => {
    if (!submitted) return;
    setErrors((prev) => ({ ...validateTransaction({ amount, category, description, expense }), ...(prev.form ? { form: prev.form } : {}) }));
  }, [submitted, amount, category, description, expense]);

  // Switching between expense and income clears a choice that belongs to the other list.
  useEffect(() => {
    if (category && !options.some((o) => o.value === category)) setCategory(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  /** Takes or chooses a photo of a receipt and fills the form from it. The user still checks and saves. */
  async function runScan(source: ReceiptSource) {
    setScanSheet(false);
    setScanError(null);
    setScanning(true);
    try {
      const result = await scanReceipt(source, { today: todayIso(), currency: settings.currency });
      if (!result) return;
      setScan(result);
      setKind('Expense');
      if (result.totals[0]) setAmount(centsToAmount(result.totals[0].amount_cents));
      if (result.merchant) setDescription(result.merchant);
      if (result.date) setDate(result.date);
      setCurrency(result.currency);
      if (result.suggestion?.category_id != null) setCategory(String(result.suggestion.category_id));
      setErrors({});
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'Could not read the receipt. Try again.');
    } finally {
      setScanning(false);
    }
  }

  // Opened from "Scan receipt" on the dashboard: go straight to the camera.
  useEffect(() => {
    if (autoScan && !existing) void runScan(autoScan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    const found = validateTransaction({ amount, category, description, expense });
    setSubmitted(true);
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

          {!existing && expense && (
            <SecondaryButton
              label={scanning ? 'Reading receipt…' : 'Scan receipt'}
              leadingIcon={ScanLine}
              onPress={scanning ? undefined : () => setScanSheet(true)}
            />
          )}
          {scanError && <Alert type="error" title="Couldn’t read the receipt" description={scanError} />}
          {scan && (
            <ScanNotes
              scan={scan}
              currency={currency}
              chosenCents={Number(amount) > 0 ? Math.round(Number(amount) * 100) : null}
              onPickAmount={(cents) => setAmount(centsToAmount(cents))}
            />
          )}

          {errors.form && <Alert type="error" title="Couldn’t save" description={errors.form} />}
          {fixing.length > 0 && <Alert type="error" title={banner.title} description={banner.description} />}

          <AmountInput
            label="Amount"
            currency={currency}
            currencySymbol={symbol}
            value={amount}
            onChangeText={(v) => {
              setAmount(v);
              setErrors((e) => clearError(e, 'amount'));
            }}
            error={errors.amount}
          />
          <TextField
            label="Description"
            value={description}
            onChangeText={(v) => {
              setDescription(v);
              setErrors((e) => clearError(e, 'description'));
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
              setErrors((e) => clearError(e, 'category'));
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

      <BottomSheet visible={scanSheet} title="Scan receipt" onClose={() => setScanSheet(false)}>
        <SheetAction icon={Camera} title="Take a photo" subtitle="Lay the receipt flat in good light" onPress={() => runScan('camera')} />
        <SheetAction icon={ImageIcon} title="Choose a photo" subtitle="Pick a receipt photo you already have" onPress={() => runScan('library')} />
      </BottomSheet>
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

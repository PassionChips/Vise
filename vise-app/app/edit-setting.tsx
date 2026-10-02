import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Alert } from '../src/components/Alert';
import { IconButton, PrimaryButton } from '../src/components/Buttons';
import { AmountInput, SelectField, TextField } from '../src/components/Inputs';
import { QueryState } from '../src/components/QueryState';
import { useCoreQuery } from '../src/data/store';
import { centsToAmount } from '../src/format';
import { resolveSource, sourceOptions } from '../src/data/pickers';
import { currencies, currencyByCode, type CurrencyCode } from '../src/features/onboarding/data';
import { getSettings, listIncomeSources, updateSettings, ViseError } from '../src/services/viseCore';
import type { IncomeSource, Settings, UpdateSettingsInput } from '../src/services/types';
import { color, spacing, themed, type } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeProvider';

type Field = 'name' | 'currency' | 'income' | 'source' | 'threshold';

const TITLES: Record<Field, string> = {
  name: 'Your name',
  currency: 'Currency',
  income: 'Monthly income',
  source: 'Income source',
  threshold: 'Warning threshold',
};

/** One screen for the editable settings; saves through rust-core, then Settings, Dashboard and Budgets reload. */
export default function EditSettingScreen() {
  useTheme();
  const { field } = useLocalSearchParams<{ field?: Field }>();
  const kind: Field = field && field in TITLES ? field : 'name';
  const data = useCoreQuery(async () => ({ settings: await getSettings(), sources: await listIncomeSources() }));

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.bar}>
        <View style={styles.barSide} />
        <Text accessibilityRole="header" style={[type.headingMedium, styles.title]}>{TITLES[kind]}</Text>
        <View style={styles.barSide}>
          <IconButton icon={X} accessibilityLabel="Close" onPress={() => router.back()} />
        </View>
      </View>
      <QueryState query={data}>{({ settings, sources }) => <Form kind={kind} settings={settings} sources={sources} />}</QueryState>
    </SafeAreaView>
  );
}

function Form({ kind, settings, sources }: { kind: Field; settings: Settings; sources: IncomeSource[] }) {
  const [text, setText] = useState(
    kind === 'name'
      ? (settings.display_name ?? '')
      : kind === 'income'
        ? settings.monthly_income_cents != null ? centsToAmount(settings.monthly_income_cents) : ''
        : kind === 'threshold'
          ? String(settings.warning_threshold_percent)
          : '',
  );
  const [choice, setChoice] = useState<string | null>(
    kind === 'currency' ? settings.currency : kind === 'source' && settings.income_source_id != null ? String(settings.income_source_id) : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const input: UpdateSettingsInput = {};
      if (kind === 'name') input.display_name = text;
      if (kind === 'income') input.monthly_income = text;
      if (kind === 'threshold') input.warning_threshold_percent = Number(text);
      if (kind === 'currency') {
        if (!choice) throw new Error('Choose a currency');
        input.currency = choice;
      }
      if (kind === 'source') {
        if (!choice) throw new Error('Choose an income source');
        input.income_source_id = await resolveSource(choice);
      }
      await updateSettings(input);
      router.back();
    } catch (e) {
      setError(e instanceof ViseError || e instanceof Error ? e.message : 'Could not save. Try again.');
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {kind === 'name' && <TextField label="Name" value={text} onChangeText={setText} placeholder="Your name" error={error ?? undefined} helperText="Leave blank to remove it." />}
        {kind === 'income' && (
          <AmountInput
            label="Expected monthly income"
            currency={settings.currency}
            currencySymbol={currencyByCode(settings.currency as CurrencyCode)?.symbol ?? settings.currency}
            value={text}
            onChangeText={setText}
            helperText="Used for “left to spend” until your real income is recorded. Leave blank to clear."
            error={error ?? undefined}
          />
        )}
        {kind === 'threshold' && (
          <TextField
            label="Warn when a budget reaches (%)"
            value={text}
            onChangeText={(v) => setText(v.replace(/[^0-9]/g, ''))}
            helperText="Budgets show “near limit” from this percentage of their limit."
            error={error ?? undefined}
          />
        )}
        {kind === 'currency' && (
          <SelectField
            label="Currency"
            options={currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name} · ${c.symbol}` }))}
            value={choice}
            onChange={setChoice}
            error={error ?? undefined}
          />
        )}
        {kind === 'source' && (
          <SelectField label="Income source" options={sourceOptions(sources)} value={choice} onChange={setChoice} error={error ?? undefined} />
        )}
        {kind === 'currency' && (
          <Alert type="info" title="Existing transactions keep their currency" description="VISE doesn’t convert amounts. Changing currency affects new entries and what the screens total up." />
        )}
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton label="Save" loading={saving} onPress={save} />
      </View>
    </KeyboardAvoidingView>
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

import { router } from 'expo-router';
import { ChevronLeft, FileUp, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Alert } from '../src/components/Alert';
import { IconButton, PrimaryButton, SecondaryButton, TertiaryButton } from '../src/components/Buttons';
import { Card } from '../src/components/Card';
import { LoadingView, QueryState } from '../src/components/QueryState';
import { suggestedChoices } from '../src/data/importCategories';
import { pickCsvFile, type PickedFile } from '../src/data/importFile';
import { buildInput, emptyOptions, summaryLines, type ImportOptions } from '../src/data/importFlow';
import { useCoreQuery } from '../src/data/store';
import { CategoryStep } from '../src/features/import/CategoryStep';
import { CheckStep } from '../src/features/import/CheckStep';
import { todayIso } from '../src/format';
import type { ExpenseCategory, ImportCategoryChoice, ImportPreview, ImportSummary } from '../src/services/types';
import { commitImport, getSettings, listCategories, previewImport } from '../src/services/viseCore';
import { color, spacing, themed, type } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeProvider';

type Step = 'file' | 'check' | 'categorize' | 'done';

const TITLES: Record<Step, string> = {
  file: 'Import data',
  check: 'Check the file',
  categorize: 'Categorize',
  done: 'Import finished',
};

const message = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** Import a CSV of any layout: pick the file, check what was found, categorize by merchant, save. */
export default function ImportScreen() {
  useTheme();
  const data = useCoreQuery(async () => ({ settings: await getSettings(), categories: await listCategories() }));
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <QueryState query={data}>
        {({ settings, categories }) => <Flow currency={settings.currency} categories={categories} />}
      </QueryState>
    </SafeAreaView>
  );
}

function Flow({ currency, categories }: { currency: string; categories: ExpenseCategory[] }) {
  const [step, setStep] = useState<Step>('file');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [options, setOptions] = useState<ImportOptions>(emptyOptions);
  const [preview, setPreview] = useState<{ data?: ImportPreview; error?: string; loading: boolean }>({ loading: false });
  const [choices, setChoices] = useState<ImportCategoryChoice[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const defaults = { today: todayIso(), currency };
  const optionsKey = JSON.stringify(options);

  // Reads the file again whenever the user changes how it should be read.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setPreview((p) => ({ data: p.data, loading: true }));
    previewImport(buildInput(file.content, options, defaults))
      .then((data) => !cancelled && setPreview({ data, loading: false }))
      .catch((e: unknown) => !cancelled && setPreview({ error: message(e, 'Could not read that file.'), loading: false }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, optionsKey, currency]);

  async function chooseFile() {
    setError(null);
    try {
      const picked = await pickCsvFile();
      if (!picked) return;
      setFile(picked);
      setOptions(emptyOptions);
      setChoices([]);
      setPreview({ loading: true });
      setStep('check');
    } catch (e) {
      setError(message(e, 'Could not open that file.'));
    }
  }

  async function save(withChoices: ImportCategoryChoice[]) {
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      const input = buildInput(file.content, options, defaults);
      setSummary(await commitImport(withChoices.length > 0 ? { ...input, categories: withChoices } : input));
      setStep('done');
    } catch (e) {
      setError(message(e, 'Nothing was imported. Try again.'));
    } finally {
      setSaving(false);
    }
  }

  const data = preview.data;
  const ready = data?.stats.ready ?? 0;
  const groups = data?.groups ?? [];

  function next() {
    if (groups.length > 0) {
      setChoices(suggestedChoices(groups));
      setError(null);
      setStep('categorize');
    } else {
      void save([]);
    }
  }

  const back = step === 'check' ? () => setStep('file') : step === 'categorize' ? () => setStep('check') : null;
  const importLabel = `Import ${ready} ${ready === 1 ? 'transaction' : 'transactions'}`;

  return (
    <>
      <View style={styles.bar}>
        <View style={styles.barSide}>{back && <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={back} />}</View>
        <Text accessibilityRole="header" style={[type.headingMedium, styles.title]}>
          {TITLES[step]}
        </Text>
        <View style={styles.barSide}>
          <IconButton icon={X} accessibilityLabel="Close" onPress={() => router.back()} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {error && <Alert type="error" title={step === 'file' ? 'Couldn’t open the file' : 'Couldn’t import'} description={error} />}

        {step === 'file' && (
          <>
            <Card style={styles.intro}>
              <Text style={[type.headingMedium, styles.primary]}>Bring your own spreadsheet</Text>
              <Text style={[type.bodyMedium, styles.secondary]}>
                Choose a CSV from your bank or spreadsheet. Column names can be anything: VISE works out which column is
                the date, the amount and the description, and you can fix anything it gets wrong before saving.
              </Text>
              <Text style={[type.bodyMedium, styles.secondary]}>
                Rows with no date use the nearest dated row, or today if the file has no dates. Rows you already have are
                skipped. Excel files: use Save as → CSV first.
              </Text>
            </Card>
            <PrimaryButton label="Choose a CSV file" onPress={chooseFile} />
          </>
        )}

        {(step === 'check' || step === 'categorize') && file && (
          <Card style={styles.fileCard}>
            <FileUp size={20} color={color.content.primary} />
            <Text numberOfLines={1} style={[type.bodyMedium, styles.primary, styles.flex]}>
              {file.name}
            </Text>
            <TertiaryButton label="Change" onPress={chooseFile} />
          </Card>
        )}

        {step === 'check' && !data && preview.loading && <LoadingView />}
        {step === 'check' && !data && preview.error && (
          <Alert type="error" title="That file can’t be imported" description={preview.error} />
        )}
        {step === 'check' && data && (
          <>
            {preview.error && <Alert type="error" title="Couldn’t apply that change" description={preview.error} />}
            <CheckStep preview={data} options={options} onOptions={setOptions} />
          </>
        )}

        {step === 'categorize' && data && (
          <CategoryStep groups={groups} categories={categories} currency={currency} choices={choices} onChoices={setChoices} />
        )}

        {step === 'done' && summary && (
          <Card style={styles.intro}>
            <Text accessibilityRole="header" style={[type.headingMedium, styles.primary]}>
              All done
            </Text>
            {summaryLines(summary).map((line) => (
              <Text key={line} style={[type.bodyLarge, styles.secondary]}>
                {line}
              </Text>
            ))}
          </Card>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {step === 'check' && (
          <PrimaryButton
            label={ready === 0 ? 'Nothing to import' : groups.length > 0 ? 'Next: categorize' : importLabel}
            disabled={ready === 0 || preview.loading || !data}
            loading={saving}
            onPress={next}
          />
        )}
        {step === 'categorize' && <PrimaryButton label={importLabel} loading={saving} onPress={() => save(choices)} />}
        {step === 'done' && (
          <>
            <PrimaryButton label="Done" onPress={() => router.back()} />
            <SecondaryButton label="View transactions" onPress={() => router.replace('/transactions')} />
          </>
        )}
      </View>
    </>
  );
}

const styles = themed(() => ({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: color.surface.background },
  primary: { color: color.content.primary },
  secondary: { color: color.content.secondary },
  bar: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[16] },
  barSide: { width: 44, alignItems: 'center' },
  title: { flex: 1, textAlign: 'center', color: color.content.primary },
  body: { gap: spacing[16], paddingHorizontal: spacing[24], paddingTop: spacing[8], paddingBottom: spacing[24] },
  intro: { gap: spacing[12] },
  fileCard: { flexDirection: 'row', alignItems: 'center', gap: spacing[12], paddingVertical: spacing[8] },
  footer: { gap: spacing[8], paddingHorizontal: spacing[24], paddingBottom: spacing[16] },
}));

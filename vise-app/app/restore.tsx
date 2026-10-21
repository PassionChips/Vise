import { router, useLocalSearchParams } from 'expo-router';
import { FileUp, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Alert } from '../src/components/Alert';
import { IconButton, PrimaryButton, TertiaryButton } from '../src/components/Buttons';
import { Card } from '../src/components/Card';
import { TextField } from '../src/components/Inputs';
import { WarningDialog } from '../src/components/Overlays';
import { pickBackupFile, type PickedBackup } from '../src/data/backupFiles';
import { describeLastBackup, summaryLines } from '../src/data/backupNames';
import type { BackupInspection } from '../src/services/types';
import { inspectBackup, restoreBackup, ViseError } from '../src/services/viseCore';
import { color, spacing, themed, type } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeProvider';

type Step = 'pick' | 'unlock' | 'confirm' | 'done';

const message = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/**
 * Restore from a backup file. Opened from the Welcome page ("I already use VISE") on a fresh install, and from
 * Settings (`?from=settings`) where it replaces data that is already here, so it asks once more.
 */
export default function RestoreScreen() {
  useTheme();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const replacing = from === 'settings';

  const [step, setStep] = useState<Step>('pick');
  const [picked, setPicked] = useState<PickedBackup | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [inspection, setInspection] = useState<BackupInspection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // The private copy of the chosen file is removed when the screen closes.
  const pickedRef = useRef<PickedBackup | null>(null);
  pickedRef.current = picked;
  useEffect(() => () => pickedRef.current?.discard(), []);

  /** Reads what is in the file; asks for the passphrase if it is protected. */
  async function inspect(file: PickedBackup, secret?: string) {
    setBusy(true);
    setError(null);
    setPassphraseError(null);
    try {
      const result = await inspectBackup(file.path, secret);
      if (result.needs_passphrase) {
        setStep('unlock');
      } else {
        setInspection(result);
        setStep('confirm');
      }
    } catch (e) {
      // A wrong passphrase is shown on its field; anything else on the page.
      if (e instanceof ViseError && e.field === 'passphrase') setPassphraseError(e.message);
      else setError(message(e, 'That file could not be read.'));
    } finally {
      setBusy(false);
    }
  }

  async function choose() {
    setError(null);
    try {
      const file = await pickBackupFile();
      if (!file) return;
      picked?.discard();
      setPicked(file);
      setPassphrase('');
      setInspection(null);
      await inspect(file);
    } catch (e) {
      setError(message(e, 'Could not open that file.'));
    }
  }

  async function restore() {
    if (!picked) return;
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      await restoreBackup(picked.path, passphrase || undefined);
      setStep('done');
    } catch (e) {
      setError(message(e, 'The backup could not be restored. Your data was not changed.'));
    } finally {
      setBusy(false);
    }
  }

  const finish = () => (replacing ? router.dismissAll() : router.replace('/'));
  const title = { pick: 'Restore your data', unlock: 'Unlock the backup', confirm: 'Restore this backup?', done: 'Welcome back' }[step];

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.bar}>
        <View style={styles.barSide} />
        <Text accessibilityRole="header" style={[type.headingMedium, styles.title]}>
          {title}
        </Text>
        <View style={styles.barSide}>
          {step !== 'done' && <IconButton icon={X} accessibilityLabel="Close" onPress={() => router.back()} />}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {error && <Alert type="error" title={step === 'confirm' ? 'Couldn’t restore' : 'Couldn’t open that file'} description={error} />}

        {step === 'pick' && (
          <Card style={styles.intro}>
            <Text style={[type.headingMedium, styles.primary]}>Bring your data back</Text>
            <Text style={[type.bodyMedium, styles.secondary]}>
              Choose the backup file you saved earlier. It ends in <Text style={type.button}>.vise</Text>.
            </Text>
            <Text style={[type.bodyMedium, styles.secondary]}>
              Look in the folder you picked when you backed up (for example Documents → VISE), in Google Drive, or in your downloads.
            </Text>
          </Card>
        )}

        {picked && step !== 'pick' && (
          <Card style={styles.file}>
            <FileUp size={20} color={color.content.primary} />
            <Text numberOfLines={1} style={[type.bodyMedium, styles.primary, styles.flex]}>
              {picked.name}
            </Text>
            <TertiaryButton label="Change" onPress={choose} />
          </Card>
        )}

        {step === 'unlock' && (
          <>
            <Text style={[type.bodyMedium, styles.secondary]}>
              This backup is protected. Enter the passphrase you chose when you made it.
            </Text>
            <TextField label="Passphrase" value={passphrase} onChangeText={setPassphrase} secureTextEntry error={passphraseError ?? undefined} />
          </>
        )}

        {step === 'confirm' && inspection?.summary && (
          <>
            <Card style={styles.intro}>
              <Text style={[type.label, styles.secondary]}>BACKUP FROM</Text>
              <Text style={[type.headingMedium, styles.primary]}>{describeLastBackup(Math.floor(Date.parse(inspection.created_at) / 1000), new Date())}</Text>
              {summaryLines(inspection.summary).map((line) => (
                <Text key={line} style={[type.bodyLarge, styles.secondary]}>
                  {line}
                </Text>
              ))}
            </Card>
            {replacing ? (
              <Alert type="warning" title="This replaces what is on this phone" description="Everything currently in VISE will be replaced by this backup." />
            ) : (
              <Text style={[type.bodyMedium, styles.secondary]}>
                Your transactions, categories, budgets and settings come back, and you go straight to the dashboard.
              </Text>
            )}
          </>
        )}

        {step === 'done' && inspection?.summary && (
          <Card style={styles.intro}>
            <Text style={[type.headingMedium, styles.primary]}>Your data is back</Text>
            {summaryLines(inspection.summary).map((line) => (
              <Text key={line} style={[type.bodyLarge, styles.secondary]}>
                {line}
              </Text>
            ))}
            <Text style={[type.bodySmall, styles.secondary]}>
              Backups keep going to a folder only after you choose one again: go to Settings → Backup & restore.
            </Text>
          </Card>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {step === 'pick' && <PrimaryButton label="Choose backup file" loading={busy} onPress={choose} />}
        {step === 'unlock' && picked && (
          <PrimaryButton label="Unlock" loading={busy} disabled={passphrase.length === 0} onPress={() => inspect(picked, passphrase)} />
        )}
        {step === 'confirm' && (
          <PrimaryButton label="Restore my data" loading={busy} onPress={() => (replacing ? setConfirming(true) : restore())} />
        )}
        {step === 'done' && <PrimaryButton label={replacing ? 'Done' : 'Go to dashboard'} onPress={finish} />}
      </View>

      <WarningDialog
        visible={confirming}
        title="Replace all data on this phone?"
        message="Everything currently in VISE will be replaced by this backup. This can’t be undone, so back up first if you might want it."
        primaryLabel="Keep my data"
        onPrimary={() => setConfirming(false)}
        secondaryLabel="Replace it"
        onSecondary={restore}
      />
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: color.surface.background },
  primary: { color: color.content.primary },
  secondary: { color: color.content.secondary },
  bar: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[16] },
  barSide: { width: 44, alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center', color: color.content.primary },
  body: { gap: spacing[16], paddingHorizontal: spacing[24], paddingTop: spacing[8], paddingBottom: spacing[24] },
  intro: { gap: spacing[8] },
  file: { flexDirection: 'row', alignItems: 'center', gap: spacing[12], paddingVertical: spacing[8] },
  footer: { gap: spacing[8], paddingHorizontal: spacing[24], paddingBottom: spacing[16] },
}));

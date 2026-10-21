import { router } from 'expo-router';
import { ArchiveRestore, X } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Alert } from '../src/components/Alert';
import { IconButton, PrimaryButton, SecondaryButton, TertiaryButton } from '../src/components/Buttons';
import { Card } from '../src/components/Card';
import { QueryState } from '../src/components/QueryState';
import { SectionHeader } from '../src/components/Layout';
import { SettingsGroup, SettingsRow } from '../src/components/Settings';
import { BackupFolderError, backUpToFolder, chooseBackupFolder, discard, makeBackupFile, shareBackup } from '../src/data/backupFiles';
import { daysSinceBackup, describeLastBackup, folderLabel } from '../src/data/backupNames';
import { passphraseProblem } from '../src/data/passphrase';
import { useCoreQuery } from '../src/data/store';
import { PassphraseFields } from '../src/features/backup/PassphraseFields';
import type { Settings } from '../src/services/types';
import { getSettings, updateSettings } from '../src/services/viseCore';
import { color, spacing, themed, type } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeProvider';

/** A backup is old enough to mention after this many days. */
const STALE_AFTER_DAYS = 30;

const message = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** Settings → Backup & restore: save everything to a folder on the phone, share a copy, or restore. */
export default function BackupScreen() {
  useTheme();
  const settings = useCoreQuery(getSettings);
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <QueryState query={settings}>{(s) => <Backup settings={s} />}</QueryState>
    </SafeAreaView>
  );
}

function Backup({ settings }: { settings: Settings }) {
  const [protect, setProtect] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<'backup' | 'share' | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [folderLost, setFolderLost] = useState(false);

  const problem = protect ? passphraseProblem(passphrase, confirmation) : null;
  const now = new Date();
  const days = daysSinceBackup(settings.last_backup_at, now);
  const folder = folderLost ? null : settings.backup_folder;

  /** Backs up to the remembered folder, asking for one first if there is none (or it stopped working). */
  async function backUp(chooseFolder: boolean) {
    setTried(true);
    setDone(null);
    setError(null);
    if (problem) return;
    setBusy('backup');
    try {
      const result = await backUpToFolder({ folder: chooseFolder ? null : folder, passphrase: protect ? passphrase : undefined });
      if (result) {
        setFolderLost(false);
        setDone(
          `Backed up ${result.info.summary.transactions} ${result.info.summary.transactions === 1 ? 'transaction' : 'transactions'} to ${folderLabel(result.folder) || 'your folder'}.`,
        );
      }
    } catch (e) {
      if (e instanceof BackupFolderError) setFolderLost(true);
      setError(message(e, 'The backup could not be saved. Try again.'));
    } finally {
      setBusy(null);
    }
  }

  async function changeFolder() {
    setError(null);
    const picked = await chooseBackupFolder();
    if (!picked) return;
    try {
      await updateSettings({ backup_folder: picked });
      setFolderLost(false);
    } catch (e) {
      setError(message(e, 'Could not remember that folder.'));
    }
  }

  /** Hands a copy to the system share sheet (Drive, Files, email...). It is not recorded as a backup: VISE cannot tell where it ended up. */
  async function share() {
    setTried(true);
    setDone(null);
    setError(null);
    if (problem) return;
    setBusy('share');
    try {
      const { file } = await makeBackupFile(protect ? passphrase : undefined);
      try {
        await shareBackup(file);
      } finally {
        discard(file);
      }
    } catch (e) {
      setError(message(e, 'The backup could not be shared.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <View style={styles.bar}>
        <View style={styles.barSide} />
        <Text accessibilityRole="header" style={[type.headingMedium, styles.title]}>
          Backup & restore
        </Text>
        <View style={styles.barSide}>
          <IconButton icon={X} accessibilityLabel="Close" onPress={() => router.back()} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Card style={styles.status}>
          <Text style={[type.label, styles.secondary]}>LAST BACKUP</Text>
          <Text style={[type.headingMedium, styles.primary]}>{describeLastBackup(settings.last_backup_at, now)}</Text>
          {folder && <Text style={[type.bodySmall, styles.secondary]}>Saved to {folderLabel(folder)}</Text>}
        </Card>

        {days == null && (
          <Alert
            type="warning"
            title="Not backed up yet"
            description="Your data is only on this phone. If you delete VISE, or lose or reset the phone, it can’t be recovered."
          />
        )}
        {days != null && days >= STALE_AFTER_DAYS && (
          <Alert type="warning" title="Your backup is out of date" description={`The last backup is ${days} days old. Back up again to include what you’ve added since.`} />
        )}
        {done && <Alert type="info" title="Backup saved" description={done} />}
        {error && <Alert type="error" title="Couldn’t back up" description={error} />}

        <SectionHeader title="Back up to a folder on this phone" />
        <Text style={[type.bodyMedium, styles.secondary]}>
          The file is saved in a folder you choose, outside VISE, so it is still there if you delete the app. VISE keeps the
          newest 3 backups there.
        </Text>
        <PassphraseFields
          enabled={protect}
          onEnabled={setProtect}
          passphrase={passphrase}
          onPassphrase={setPassphrase}
          confirmation={confirmation}
          onConfirmation={setConfirmation}
          error={tried ? (problem ?? undefined) : undefined}
        />
        <PrimaryButton
          label={folder ? 'Back up now' : 'Choose a folder and back up'}
          loading={busy === 'backup'}
          disabled={busy != null}
          onPress={() => backUp(false)}
        />
        {folder && <TertiaryButton label={`Change folder (${folderLabel(folder)})`} onPress={changeFolder} />}

        <SectionHeader title="Keep a copy somewhere else" />
        <Text style={[type.bodyMedium, styles.secondary]}>
          Send the backup to Google Drive, Files or your email. Save it somewhere private: it contains all your data.
        </Text>
        <SecondaryButton label={busy === 'share' ? 'Preparing…' : 'Share a backup copy'} onPress={busy != null ? undefined : share} />

        <SectionHeader title="Restore" />
        <SettingsGroup>
          <SettingsRow
            type="navigation"
            icon={ArchiveRestore}
            label="Restore from a backup file"
            onPress={() => router.push({ pathname: '/restore', params: { from: 'settings' } })}
          />
        </SettingsGroup>
      </ScrollView>
    </>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.surface.background },
  primary: { color: color.content.primary },
  secondary: { color: color.content.secondary },
  bar: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[16] },
  barSide: { width: 44, alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center', color: color.content.primary },
  body: { gap: spacing[16], paddingHorizontal: spacing[24], paddingTop: spacing[8], paddingBottom: spacing[24] },
  status: { gap: spacing[4] },
}));

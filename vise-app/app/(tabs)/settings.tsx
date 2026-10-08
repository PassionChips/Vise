import Constants from 'expo-constants';
import { router } from 'expo-router';
import {
  ArchiveRestore,
  Calendar,
  Download,
  Euro,
  Info,
  Pencil,
  Trash2,
  TriangleAlert,
  Upload,
  User,
  Wallet,
} from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Alert } from '../../src/components/Alert';
import { Avatar } from '../../src/components/Avatar';
import { SecondaryButton, TertiaryButton } from '../../src/components/Buttons';
import { Card } from '../../src/components/Card';
import { SegmentedControl } from '../../src/components/Controls';
import { Screen, TopAppBar } from '../../src/components/Layout';
import { BottomSheet, ConfirmDialog } from '../../src/components/Overlays';
import { QueryState } from '../../src/components/QueryState';
import { SettingsGroup, SettingsRow, SettingsSectionHeader } from '../../src/components/Settings';
import { describeErasure } from '../../src/data/erasure';
import { downloadDataCsv, removeExportFiles } from '../../src/data/exportData';
import { AVATARS } from '../../src/data/avatars';
import { describeLastBackup } from '../../src/data/backupNames';
import { useCoreQuery } from '../../src/data/store';
import { currencyByCode, type CurrencyCode } from '../../src/features/onboarding/data';
import { formatMoney } from '../../src/format';
import { deleteAllData, getDataOverview, getSettings, updateSettings } from '../../src/services/viseCore';
import { useTheme, type ThemePreference } from '../../src/theme/ThemeProvider';
import { color, spacing, themed, type } from '../../src/theme/tokens';

type Field = 'name' | 'currency' | 'income' | 'source' | 'threshold';
const edit = (field: Field) => () => router.push({ pathname: '/edit-setting', params: { field } });

const THEME_LABELS = { light: 'Light', dark: 'Dark', system: 'System' } as const satisfies Record<ThemePreference, string>;
const THEME_OPTIONS = [THEME_LABELS.light, THEME_LABELS.dark, THEME_LABELS.system] as const;
type ThemeLabel = (typeof THEME_OPTIONS)[number];
const preferenceFor = (label: ThemeLabel) =>
  (Object.keys(THEME_LABELS) as ThemePreference[]).find((key) => THEME_LABELS[key] === label) ?? 'system';

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** Every value here is read from, and saved to, the settings stored by rust-core. */
export default function SettingsScreen() {
  useTheme();
  const settings = useCoreQuery(getSettings);
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen header={<TopAppBar title="Settings" />} gap={spacing[8]}>
      <QueryState query={settings}>
        {(s) => {
          const symbol = currencyByCode(s.currency as CurrencyCode)?.symbol;
          return (
            <>
              <ProfileCard name={s.display_name} avatarId={s.avatar} />

              <SettingsSectionHeader title="Appearance" />
              <AppearancePicker />

              <SettingsSectionHeader title="Currency & income" />
              <SettingsGroup>
                <SettingsRow type="navigation" icon={Euro} label="Currency" value={symbol ? `${s.currency} (${symbol})` : s.currency} onPress={edit('currency')} />
                <SettingsRow
                  type="navigation"
                  icon={Wallet}
                  label="Monthly income"
                  value={s.monthly_income_cents != null ? formatMoney(s.monthly_income_cents, { currency: s.currency }) : 'Not set'}
                  onPress={edit('income')}
                />
                <SettingsRow type="navigation" icon={Calendar} label="Income source" value={s.income_source_name ?? 'Not set'} onPress={edit('source')} />
              </SettingsGroup>

              <SettingsSectionHeader title="Budgets" />
              <SettingsGroup>
                <SettingsRow type="navigation" icon={TriangleAlert} label="Warning threshold" value={`${s.warning_threshold_percent}%`} onPress={edit('threshold')} />
              </SettingsGroup>

              <SettingsSectionHeader title="Data" />
              <DataSection lastBackupAt={s.last_backup_at} />

              <SettingsSectionHeader title="About" />
              <SettingsGroup>
                <SettingsRow type="value" icon={Info} label="Version" value={version} />
                <SettingsRow type="value" icon={User} label="Data" value="On this device (and your backups)" />
              </SettingsGroup>
            </>
          );
        }}
      </QueryState>
    </Screen>
  );
}

// ----- Profile -----

function ProfileCard({ name, avatarId }: { name: string | null; avatarId: string | null }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const displayName = name ?? 'You';

  /** `id` '' = initials. The sheet closes only once rust-core has saved the choice. */
  async function choose(id: string) {
    setError(null);
    setSaving(id);
    try {
      await updateSettings({ avatar: id });
      setSheetOpen(false);
    } catch (e) {
      setError(errorMessage(e, 'Could not save your avatar. Try again.'));
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <Card style={styles.profile}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose avatar"
          onPress={() => {
            setError(null);
            setSheetOpen(true);
          }}
          style={styles.avatarButton}
        >
          <Avatar name={displayName} size={56} avatarId={avatarId} />
          <View style={styles.editBadge}>
            <Pencil size={11} strokeWidth={2.5} color={color.content.onBrand} />
          </View>
        </Pressable>
        <View style={styles.profileText}>
          <Text numberOfLines={1} style={[type.headingMedium, styles.primary]}>{name ?? 'Add your name'}</Text>
          <Text numberOfLines={1} style={[type.bodySmall, styles.secondary]}>Stored on this device</Text>
        </View>
        <TertiaryButton label="Edit" accessibilityLabel="Edit name" onPress={edit('name')} />
      </Card>

      <BottomSheet visible={sheetOpen} title="Choose an avatar" onClose={() => setSheetOpen(false)}>
        <View accessibilityRole="radiogroup" accessibilityLabel="Avatar" style={styles.avatarGrid}>
          <AvatarChoice label="Use my initials" selected={!avatarId} busy={saving === ''} onPress={() => choose('')}>
            <Avatar name={displayName} size={52} />
          </AvatarChoice>
          {AVATARS.map((option) => (
            <AvatarChoice
              key={option.id}
              label={`${option.label} avatar`}
              selected={avatarId === option.id}
              busy={saving === option.id}
              onPress={() => choose(option.id)}
            >
              <Avatar name={displayName} size={52} avatarId={option.id} />
            </AvatarChoice>
          ))}
        </View>
        {error && <Alert type="error" title="Avatar not saved" description={error} />}
      </BottomSheet>
    </>
  );
}

function AvatarChoice({
  label,
  selected,
  busy,
  onPress,
  children,
}: {
  label: string;
  selected: boolean;
  busy: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.avatarChoice, selected && styles.avatarChoiceSelected, pressed && styles.avatarChoicePressed]}
    >
      {children}
      {busy && (
        <View style={styles.avatarBusy}>
          <ActivityIndicator color={color.brand.primary} />
        </View>
      )}
    </Pressable>
  );
}

// ----- Appearance -----

function AppearancePicker() {
  const { preference, deviceScheme, setPreference } = useTheme();
  const [error, setError] = useState<string | null>(null);

  async function choose(label: ThemeLabel) {
    setError(null);
    try {
      await setPreference(preferenceFor(label));
    } catch (e) {
      setError(errorMessage(e, 'Could not save your appearance setting.'));
    }
  }

  const helper =
    preference === 'system'
      ? `Follows your device: currently ${THEME_LABELS[deviceScheme]}`
      : `Always ${THEME_LABELS[preference].toLowerCase()}, whatever your device uses`;

  return (
    <SettingsGroup>
      <View style={styles.themePicker}>
        <SegmentedControl stretch accessibilityLabel="Appearance" options={THEME_OPTIONS} value={THEME_LABELS[preference]} onChange={choose} />
        <Text style={[type.bodySmall, styles.secondary]}>{helper}</Text>
        {error && <Alert type="error" title="Not saved" description={error} />}
      </View>
    </SettingsGroup>
  );
}

// ----- Data: export and delete -----

type Status = { kind: 'error' | 'info'; title: string; description: string } | null;

function DataSection({ lastBackupAt }: { lastBackupAt: number | null }) {
  const overview = useCoreQuery(getDataOverview);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savedCopy, setSavedCopy] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  /** Returns the file name on success, null if it failed (the error is shown). */
  async function exportCsv(onError: (message: string) => void): Promise<string | null> {
    setExporting(true);
    try {
      const result = await downloadDataCsv();
      return result.filename;
    } catch (e) {
      onError(errorMessage(e, 'Could not create the CSV file. Try again.'));
      return null;
    } finally {
      setExporting(false);
    }
  }

  async function exportFromRow() {
    setStatus(null);
    const filename = await exportCsv((message) => setStatus({ kind: 'error', title: 'Export failed', description: message }));
    if (filename) {
      setStatus({ kind: 'info', title: 'Export ready', description: `${filename} contains all your transactions and budgets.` });
    }
  }

  async function exportFromDialog() {
    setDialogError(null);
    const filename = await exportCsv(setDialogError);
    if (filename) setSavedCopy(filename);
  }

  function openConfirm() {
    setSavedCopy(null);
    setDialogError(null);
    overview.reload();
    setConfirmOpen(true);
  }

  async function confirmDelete() {
    setDialogError(null);
    setDeleting(true);
    try {
      await deleteAllData();
    } catch (e) {
      // Nothing was erased: rust-core deletes in one transaction.
      setDialogError(errorMessage(e, 'Your data was not deleted. Try again.'));
      setDeleting(false);
      return;
    }
    removeExportFiles();
    setDeleting(false);
    setConfirmOpen(false);
    router.replace('/onboarding');
  }

  const message = overview.data
    ? describeErasure(overview.data)
    : 'This permanently erases all your transactions, budgets, categories, income sources, name, avatar and settings from this device. It can’t be undone. Backup files you saved elsewhere are not deleted.';

  return (
    <>
      <SettingsGroup>
        <SettingsRow
          type="navigation"
          icon={Download}
          label={exporting ? 'Preparing CSV…' : 'Export data (CSV)'}
          value="CSV"
          onPress={exporting ? undefined : exportFromRow}
        />
        <SettingsRow type="navigation" icon={ArchiveRestore} label="Backup & restore" value={describeLastBackup(lastBackupAt, new Date())} onPress={() => router.push('/backup')} />
        <SettingsRow type="navigation" icon={Upload} label="Import data (CSV)" value="CSV" onPress={() => router.push('/import')} />
        <SettingsRow type="destructive" icon={Trash2} label="Delete all my data" onPress={openConfirm} />
      </SettingsGroup>
      {status && <Alert type={status.kind} title={status.title} description={status.description} />}

      <ConfirmDialog
        visible={confirmOpen}
        title="Delete all your data?"
        message={message}
        confirmLabel="Delete everything"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      >
        <View style={styles.dialogExtra}>
          {savedCopy ? (
            <Alert type="info" title="Copy saved" description={`${savedCopy} has your transactions and budgets.`} />
          ) : (
            <>
              <Alert type="warning" title="Download your data first" description="Save a CSV copy before deleting. Once deleted, it can’t be recovered." />
              <SecondaryButton
                label={exporting ? 'Preparing CSV…' : 'Download CSV first'}
                leadingIcon={Download}
                onPress={exporting || deleting ? undefined : exportFromDialog}
              />
            </>
          )}
          {dialogError && <Alert type="error" title="That didn’t work" description={dialogError} />}
        </View>
      </ConfirmDialog>
    </>
  );
}

const styles = themed(() => ({
  primary: { color: color.content.primary },
  secondary: { color: color.content.secondary },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing[16] },
  profileText: { flex: 1, gap: 2 },
  avatarButton: { borderRadius: 28 },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing[8], paddingBottom: spacing[8] },
  avatarChoice: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarChoiceSelected: { borderColor: color.brand.primary },
  avatarChoicePressed: { backgroundColor: color.surface.variant },
  avatarBusy: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  editBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.brand.primary,
    borderWidth: 2,
    borderColor: color.surface.default,
  },
  themePicker: { gap: 10, paddingHorizontal: spacing[16], paddingVertical: spacing[12] },
  dialogExtra: { gap: spacing[8] },
}));

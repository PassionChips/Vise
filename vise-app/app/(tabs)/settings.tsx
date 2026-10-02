import Constants from 'expo-constants';
import {
  Bell,
  Calendar,
  ChartNoAxesCombined,
  CircleAlert,
  CircleDot,
  Download,
  Euro,
  Globe,
  Info,
  Lock,
  ReceiptText,
  Settings,
  Sparkles,
  Sun,
  Target,
  Trash2,
  TriangleAlert,
} from 'lucide-react-native';
import { useState } from 'react';
import { Alert as NativeAlert, Linking, Platform, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { Alert } from '../../src/components/Alert';
import { Avatar } from '../../src/components/Avatar';
import { SecondaryButton, TertiaryButton } from '../../src/components/Buttons';
import { Card } from '../../src/components/Card';
import { SegmentedControl } from '../../src/components/Controls';
import { Screen, TopAppBar } from '../../src/components/Layout';
import { SettingsGroup, SettingsRow, SettingsSectionHeader } from '../../src/components/Settings';
import { user, warningThresholdPercent } from '../../src/data/demo';
import { color, spacing, type } from '../../src/theme/tokens';

const THEMES = ['Light', 'Dark', 'System'] as const;

function confirmDestructive(title: string, message: string, action: string) {
  NativeAlert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive' },
  ]);
}

export default function SettingsScreen() {
  const scheme = useColorScheme();
  const [theme, setTheme] = useState<(typeof THEMES)[number]>('System');
  const [showPredictions, setShowPredictions] = useState(true);
  const [faceIdLock, setFaceIdLock] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);

  // Notification permission is not wired up yet, so these toggles stay disabled.
  const notificationsAllowed = false;
  const settingsAppName = Platform.OS === 'ios' ? 'iOS Settings' : 'system settings';
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen header={<TopAppBar title="Settings" />} gap={spacing[8]}>
      <Card style={styles.profile}>
        <Avatar name={user.name} size={56} />
        <View style={styles.profileText}>
          <Text numberOfLines={1} style={[type.headingMedium, styles.primary]}>{user.name}</Text>
          <Text numberOfLines={1} style={[type.bodySmall, styles.secondary]}>{user.email}</Text>
        </View>
        <TertiaryButton label="Edit" accessibilityLabel="Edit profile" />
      </Card>

      <SettingsSectionHeader title="Appearance" />
      <SettingsGroup>
        <View style={styles.themePicker}>
          <SegmentedControl options={THEMES} value={theme} onChange={setTheme} stretch accessibilityLabel="Theme" />
          {theme === 'System' && (
            <Text style={[type.bodySmall, styles.secondary]}>
              Follows your device: currently {scheme === 'dark' ? 'Dark' : 'Light'}
            </Text>
          )}
        </View>
      </SettingsGroup>

      <SettingsSectionHeader title="Currency & region" />
      <SettingsGroup>
        <SettingsRow type="navigation" icon={Euro} label="Currency" value="EUR (€)" />
        <SettingsRow type="navigation" icon={CircleDot} label="Number format" value="1,234.56" />
        <SettingsRow type="navigation" icon={Calendar} label="Date format" value="DD/MM/YYYY" />
        <SettingsRow type="navigation" icon={Calendar} label="First day of week" value="Monday" />
        <SettingsRow type="navigation" icon={Globe} label="Language" value="English" />
      </SettingsGroup>

      <SettingsSectionHeader title="Budgets" />
      <SettingsGroup>
        <SettingsRow type="navigation" icon={TriangleAlert} label="Warning threshold" value={`${warningThresholdPercent}%`} />
        <SettingsRow type="navigation" icon={Calendar} label="Budget month starts" value="1st" />
        <SettingsRow type="switch" icon={Sparkles} label="Show predictions" value={showPredictions} onValueChange={setShowPredictions} />
      </SettingsGroup>

      <SettingsSectionHeader title="Notifications" />
      <SettingsGroup>
        {!notificationsAllowed && (
          <>
            <Alert
              type="warning"
              title="Notifications are off for VISE"
              description="These alerts stay off until you allow notifications."
            />
            <SettingsRow
              type="navigation"
              icon={Settings}
              label={`Open ${settingsAppName}`}
              tone="brand"
              onPress={() => Linking.openSettings()}
            />
          </>
        )}
        <SettingsRow type="switch" icon={Bell} label="Approaching a limit" value={false} onValueChange={() => {}} disabled={!notificationsAllowed} />
        <SettingsRow type="switch" icon={CircleAlert} label="Budget exceeded" value={false} onValueChange={() => {}} disabled={!notificationsAllowed} />
        <SettingsRow type="switch" icon={ChartNoAxesCombined} label="Weekly summary" value={false} onValueChange={() => {}} disabled={!notificationsAllowed} />
        <SettingsRow type="switch" icon={ChartNoAxesCombined} label="Monthly summary" value={false} onValueChange={() => {}} disabled={!notificationsAllowed} />
        <SettingsRow type="switch" icon={ReceiptText} label="Transaction reminders" value={false} onValueChange={() => {}} disabled={!notificationsAllowed} />
        <SettingsRow type="switch" icon={Target} label="Goal reminders" value={false} onValueChange={() => {}} disabled={!notificationsAllowed} />
      </SettingsGroup>

      <SettingsSectionHeader title="Privacy & security" />
      <SettingsGroup>
        <SettingsRow type="switch" icon={Lock} label="Lock with Face ID" value={faceIdLock} onValueChange={setFaceIdLock} />
        <SettingsRow type="navigation" icon={Lock} label="Privacy preferences" />
      </SettingsGroup>

      <SettingsSectionHeader title="Data" />
      <SettingsGroup>
        <SettingsRow type="navigation" icon={Download} label="Export data (CSV)" />
        <SettingsRow type="navigation" icon={Download} label="Import transactions" value="CSV" />
        <SettingsRow
          type="destructive"
          icon={Trash2}
          label="Clear demo data"
          onPress={() => confirmDestructive('Clear demo data?', 'The sample transactions and budgets will be removed.', 'Clear')}
        />
        <SettingsRow
          type="destructive"
          icon={Trash2}
          label="Delete all my data"
          onPress={() => confirmDestructive('Delete all your data?', 'Everything stored on this device will be permanently deleted.', 'Delete')}
        />
      </SettingsGroup>

      <SettingsSectionHeader title="Accessibility" />
      <SettingsGroup>
        <SettingsRow type="switch" icon={Sun} label="Reduce motion" value={reduceMotion} onValueChange={setReduceMotion} />
        <SettingsRow type="navigation" icon={Info} label="Text size" value="Uses system setting" />
      </SettingsGroup>

      <SettingsSectionHeader title="About" />
      <SettingsGroup>
        <SettingsRow type="value" icon={Info} label="Version" value={version} />
        <SettingsRow type="navigation" icon={Info} label="Help & support" />
        <SettingsRow type="navigation" icon={Lock} label="Privacy policy" />
        <SettingsRow type="navigation" icon={ReceiptText} label="Terms of service" />
      </SettingsGroup>

      <View style={styles.signOut}>
        <SecondaryButton label="Sign out" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  primary: { color: color.content.primary },
  secondary: { color: color.content.secondary },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing[16] },
  profileText: { flex: 1, gap: 2 },
  themePicker: { paddingHorizontal: spacing[16], paddingVertical: spacing[12], gap: 10 },
  signOut: { paddingTop: spacing[16] },
});

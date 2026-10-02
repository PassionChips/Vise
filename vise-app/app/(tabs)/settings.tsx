import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Calendar, Euro, Info, TriangleAlert, User, Wallet } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '../../src/components/Avatar';
import { TertiaryButton } from '../../src/components/Buttons';
import { Card } from '../../src/components/Card';
import { Screen, TopAppBar } from '../../src/components/Layout';
import { QueryState } from '../../src/components/QueryState';
import { SettingsGroup, SettingsRow, SettingsSectionHeader } from '../../src/components/Settings';
import { useCoreQuery } from '../../src/data/store';
import { currencyByCode, type CurrencyCode } from '../../src/features/onboarding/data';
import { formatMoney } from '../../src/format';
import { getSettings } from '../../src/services/viseCore';
import { color, spacing, type } from '../../src/theme/tokens';

type Field = 'name' | 'currency' | 'income' | 'source' | 'threshold';
const edit = (field: Field) => () => router.push({ pathname: '/edit-setting', params: { field } });

/** Every value here is read from, and saved to, the settings stored by rust-core. */
export default function SettingsScreen() {
  const settings = useCoreQuery(getSettings);
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen header={<TopAppBar title="Settings" />} gap={spacing[8]}>
      <QueryState query={settings}>
        {(s) => {
          const symbol = currencyByCode(s.currency as CurrencyCode)?.symbol;
          return (
            <>
              <Card style={styles.profile}>
                <Avatar name={s.display_name ?? 'You'} size={56} />
                <View style={styles.profileText}>
                  <Text numberOfLines={1} style={[type.headingMedium, styles.primary]}>{s.display_name ?? 'Add your name'}</Text>
                  <Text numberOfLines={1} style={[type.bodySmall, styles.secondary]}>Stored on this device</Text>
                </View>
                <TertiaryButton label="Edit" accessibilityLabel="Edit name" onPress={edit('name')} />
              </Card>

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

              <SettingsSectionHeader title="About" />
              <SettingsGroup>
                <SettingsRow type="value" icon={Info} label="Version" value={version} />
                <SettingsRow type="value" icon={User} label="Data" value="On this device only" />
              </SettingsGroup>
            </>
          );
        }}
      </QueryState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  primary: { color: color.content.primary },
  secondary: { color: color.content.secondary },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing[16] },
  profileText: { flex: 1, gap: 2 },
});

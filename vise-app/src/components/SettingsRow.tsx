// List/SettingsRow (value type). Group rows inside a `SettingsList` card.

import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

export function SettingsList({ children }: { children: ReactNode }) {
  return <View style={styles.list}>{children}</View>;
}

interface SettingsRowProps {
  icon: LucideIcon;
  label: string;
  value: string;
}

export function SettingsRow({ icon: Icon, label, value }: SettingsRowProps) {
  return (
    <View accessible accessibilityLabel={`${label}, ${value}`} style={styles.row}>
      <View style={styles.iconTile}>
        <Icon size={18} color={colors.contentPrimary} />
      </View>
      <Text style={[typography.bodyLarge, styles.label]}>{label}</Text>
      <Text style={[typography.bodyMedium, styles.value]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    alignSelf: 'stretch',
    paddingVertical: spacing[4],
    backgroundColor: colors.cardFill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    paddingHorizontal: spacing[16],
    paddingVertical: spacing[8],
  },
  iconTile: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    color: colors.contentPrimary,
  },
  value: {
    color: colors.contentSecondary,
  },
});

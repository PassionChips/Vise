import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';

import { color, radius, spacing, themed, type } from '../theme/tokens';

/** Uppercase section header above a settings group. */
export function SettingsSectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text accessibilityRole="header" style={[type.label, styles.secondary]}>{title.toUpperCase()}</Text>
    </View>
  );
}

/** Rounded list card that groups settings rows. */
export function SettingsGroup({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

type SettingsRowProps = {
  icon: LucideIcon;
  label: string;
} & (
  | { type: 'navigation'; value?: string; onPress?: () => void; tone?: 'default' | 'brand' }
  | { type: 'value'; value: string }
  | { type: 'switch'; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean }
  | { type: 'destructive'; onPress?: () => void }
);

/** List/SettingsRow: navigation | switch | value | destructive. */
export function SettingsRow(props: SettingsRowProps) {
  const { icon: Icon, label } = props;
  const destructive = props.type === 'destructive';
  const disabled = props.type === 'switch' && props.disabled;
  const labelColor = destructive
    ? color.feedback.error
    : disabled
      ? color.content.disabled
      : props.type === 'navigation' && props.tone === 'brand'
        ? color.brand.primary
        : color.content.primary;

  const content = (
    <>
      <View style={[styles.tile, destructive && styles.tileDestructive]}>
        <Icon size={18} strokeWidth={2} color={destructive ? color.feedback.error : color.content.primary} />
      </View>
      <Text style={[type.bodyLarge, styles.label, { color: labelColor }]}>{label}</Text>
      {(props.type === 'navigation' || props.type === 'value') && props.value != null && (
        <Text style={[type.bodyMedium, styles.secondary]}>{props.value}</Text>
      )}
      {props.type === 'navigation' && <ChevronRight size={18} strokeWidth={2} color={color.content.secondary} />}
      {props.type === 'switch' && (
        <Switch
          value={props.value}
          onValueChange={props.onValueChange}
          disabled={props.disabled}
          accessibilityLabel={label}
          trackColor={{ false: color.border.default, true: color.brand.primary }}
          thumbColor={color.surface.default}
          ios_backgroundColor={color.border.default}
        />
      )}
    </>
  );

  if (props.type === 'value') {
    return <View style={styles.row}>{content}</View>;
  }

  // Switch rows toggle on whole-row press.
  const onPress =
    props.type === 'switch'
      ? props.disabled ? undefined : () => props.onValueChange(!props.value)
      : props.onPress;

  return (
    <Pressable
      accessibilityRole={props.type === 'switch' ? 'switch' : 'button'}
      accessibilityState={props.type === 'switch' ? { checked: props.value, disabled } : undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && onPress && styles.rowPressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = themed(() => ({
  secondary: { color: color.content.secondary },
  sectionHeader: { paddingLeft: 4, paddingTop: spacing[16] },
  group: {
    backgroundColor: color.surface.default,
    borderWidth: 1,
    borderColor: color.border.default,
    borderRadius: radius.lg,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    paddingHorizontal: spacing[16],
    paddingVertical: spacing[8],
  },
  rowPressed: { backgroundColor: color.surface.variant },
  tile: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: color.surface.variant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileDestructive: { backgroundColor: color.feedback.errorSubtle },
  label: { flex: 1 },
}));

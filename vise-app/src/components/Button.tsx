// Button/Primary, Button/Tertiary and Button/Icon from the design system.

import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

type ButtonSize = 'large' | 'small';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  size?: ButtonSize;
  disabled?: boolean;
}

interface PrimaryButtonProps extends ButtonProps {
  /** Shows a spinner and announces "Saving". */
  loading?: boolean;
}

export function PrimaryButton({ label, onPress, size = 'large', disabled, loading }: PrimaryButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={loading ? 'Saving' : label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      hitSlop={size === 'small' ? { top: 2, bottom: 2 } : undefined}
      style={({ pressed }) => [
        styles.base,
        size === 'large' ? styles.large : styles.small,
        styles.primary,
        pressed && styles.primaryPressed,
        disabled && styles.primaryDisabled,
      ]}
    >
      {loading && <ActivityIndicator size="small" color={colors.buttonPrimaryLabel} />}
      <Text style={[typography.button, styles.primaryLabel]}>{label}</Text>
    </Pressable>
  );
}

/** Text-only, low-emphasis action such as "Skip". */
export function TertiaryButton({ label, onPress, size = 'large', disabled }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      // Small is 40px tall; keep a 44px touch target.
      hitSlop={size === 'small' ? { top: 2, bottom: 2 } : undefined}
      style={({ pressed }) => [
        styles.base,
        size === 'large' ? styles.large : styles.small,
        pressed && styles.tertiaryPressed,
      ]}
    >
      <Text style={[typography.button, { color: disabled ? colors.contentDisabled : colors.buttonTertiaryLabel }]}>
        {label}
      </Text>
    </Pressable>
  );
}

interface IconButtonProps {
  icon: LucideIcon;
  /** Required: there is no visible text. */
  accessibilityLabel: string;
  onPress?: () => void;
}

export function IconButton({ icon: Icon, accessibilityLabel, onPress }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.icon, pressed && styles.tertiaryPressed]}
    >
      <Icon size={24} color={colors.contentPrimary} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[8],
  },
  large: {
    height: 48,
    paddingHorizontal: spacing[20],
    borderRadius: radius.md,
  },
  small: {
    height: 40,
    paddingHorizontal: spacing[16],
    borderRadius: radius.sm,
  },
  primary: {
    alignSelf: 'stretch',
    backgroundColor: colors.buttonPrimaryFill,
  },
  primaryPressed: {
    opacity: 0.88,
  },
  primaryDisabled: {
    backgroundColor: colors.contentDisabled,
  },
  primaryLabel: {
    color: colors.buttonPrimaryLabel,
  },
  tertiaryPressed: {
    backgroundColor: colors.brandSubtle,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

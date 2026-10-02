import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { color, radius, spacing, type } from '../theme/tokens';

interface IconButtonProps {
  icon: LucideIcon;
  accessibilityLabel: string;
  /** Filled is reserved for the single most important action on a screen. */
  filled?: boolean;
  onPress?: () => void;
}

/** Button/Icon: 44×44 hit area, 24px glyph. */
export function IconButton({ icon: Icon, accessibilityLabel, filled, onPress }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        filled && styles.iconButtonFilled,
        pressed && (filled ? styles.filledPressed : styles.standardPressed),
      ]}
    >
      <Icon size={24} strokeWidth={2} color={filled ? color.content.onBrand : color.content.primary} />
    </Pressable>
  );
}

interface TextButtonProps {
  label: string;
  leadingIcon?: LucideIcon;
  trailingIcon?: LucideIcon;
  /** large = 48px (default touch size), small = 40px. */
  size?: 'large' | 'small';
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Button/Secondary: Surface/Variant fill, ink label. */
export function SecondaryButton({ label, leadingIcon: Leading, trailingIcon: Trailing, size = 'large', onPress, accessibilityLabel, style }: TextButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        size === 'large' ? styles.large : styles.small,
        styles.secondary,
        pressed && styles.secondaryPressed,
        style,
      ]}
    >
      {Leading && <Leading size={20} strokeWidth={2} color={color.content.primary} />}
      <Text style={[type.button, { color: color.content.primary }]}>{label}</Text>
      {Trailing && <Trailing size={20} strokeWidth={2} color={color.content.primary} />}
    </Pressable>
  );
}

/** Button/Tertiary: text only, Brand/Subtle on press. */
export function TertiaryButton({ label, leadingIcon: Leading, trailingIcon: Trailing, size = 'small', onPress, accessibilityLabel, style }: TextButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        size === 'large' ? styles.large : styles.small,
        pressed && styles.tertiaryPressed,
        style,
      ]}
    >
      {Leading && <Leading size={20} strokeWidth={2} color={color.brand.primary} />}
      <Text style={[type.button, { color: color.brand.primary }]}>{label}</Text>
      {Trailing && <Trailing size={20} strokeWidth={2} color={color.brand.primary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonFilled: { backgroundColor: color.brand.primary },
  standardPressed: { backgroundColor: color.surface.variant },
  filledPressed: { opacity: 0.85 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[8],
  },
  large: { height: 48, paddingHorizontal: spacing[20], borderRadius: radius.md },
  small: { height: 40, paddingHorizontal: spacing[16], borderRadius: radius.sm },
  secondary: { backgroundColor: color.surface.variant },
  secondaryPressed: { backgroundColor: color.border.default },
  tertiaryPressed: { backgroundColor: color.brand.subtle },
});

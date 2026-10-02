// Control/Radio. Selected = 2px ring + dot.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

export interface RadioOption<T extends string> {
  value: T;
  label: string;
}

interface RadioGroupProps<T extends string> {
  options: readonly RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}

export function RadioGroup<T extends string>({ options, value, onChange, accessibilityLabel }: RadioGroupProps<T>) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={styles.card}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            style={styles.row}
          >
            <View style={[styles.ring, selected && styles.ringSelected]}>
              {selected && <View style={styles.dot} />}
            </View>
            <Text style={[typography.bodyLarge, styles.label]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    paddingHorizontal: spacing[16],
    paddingVertical: spacing[4],
    backgroundColor: colors.cardFill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
  },
  row: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
  },
  ring: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.contentSecondary,
    backgroundColor: colors.surfaceDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSelected: {
    borderColor: colors.brandPrimary,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.brandPrimary,
  },
  label: {
    color: colors.contentPrimary,
  },
});

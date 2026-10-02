// Control/Radio. Selected = 2px ring + dot.

import { Pressable, Text, View } from 'react-native';

import { color, radius, spacing, themed, type } from '../theme/tokens';

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
            <Text style={[type.bodyLarge, styles.label]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themed(() => ({
  card: {
    alignSelf: 'stretch',
    paddingHorizontal: spacing[16],
    paddingVertical: spacing[4],
    backgroundColor: color.surface.default,
    borderWidth: 1,
    borderColor: color.border.default,
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
    borderColor: color.content.secondary,
    backgroundColor: color.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSelected: {
    borderColor: color.brand.primary,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: color.brand.primary,
  },
  label: {
    color: color.content.primary,
  },
}));

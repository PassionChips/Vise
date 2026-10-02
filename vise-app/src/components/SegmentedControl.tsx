// Control/SegmentedControl. Selected segment = Surface/Default + Elevation/SM on the Surface/Variant track.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, elevationSm, radius, spacing, typography } from '../theme';

interface SegmentedControlProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <View accessibilityRole="tablist" style={styles.track}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[typography.label, { color: selected ? colors.contentPrimary : colors.contentSecondary }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: spacing[4],
    padding: spacing[4],
    borderRadius: radius.md,
    backgroundColor: colors.surfaceVariant,
  },
  segment: {
    flex: 1,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: {
    backgroundColor: colors.surfaceDefault,
    ...elevationSm,
  },
});

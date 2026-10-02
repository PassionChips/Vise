import { Search, X } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { color, elevationSm, radius, spacing, type } from '../theme/tokens';

// ----- Control/SegmentedControl -----

interface SegmentedControlProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  /** Segments share the full width (e.g. the theme picker). */
  stretch?: boolean;
  accessibilityLabel?: string;
}

export function SegmentedControl<T extends string>({ options, value, onChange, stretch, accessibilityLabel }: SegmentedControlProps<T>) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={[styles.track, stretch && styles.trackStretch]}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option)}
            style={[styles.segment, stretch && styles.segmentStretch, selected && styles.segmentSelected]}
          >
            <Text style={[type.label, { color: selected ? color.content.primary : color.content.secondary }]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ----- Control/FilterChip -----

interface FilterChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

/** Selected = inverted. 36px visual height inside a 44px hit area. */
export function FilterChip({ label, selected, onPress }: FilterChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={4}
      style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle]}
    >
      <Text style={[type.label, { color: selected ? color.surface.background : color.content.primary }]}>{label}</Text>
    </Pressable>
  );
}

interface FilterChipRowProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}

/** Horizontal, scrollable row of filter chips. */
export function FilterChipRow<T extends string>({ options, value, onChange }: FilterChipRowProps<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {options.map((option) => (
        <FilterChip key={option} label={option} selected={option === value} onPress={() => onChange(option)} />
      ))}
    </ScrollView>
  );
}

// ----- Input/Search -----

interface SearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
}

export function SearchInput({ value, onChangeText, placeholder }: SearchInputProps) {
  return (
    <View style={styles.search}>
      <Search size={20} strokeWidth={2} color={color.content.secondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.content.secondary}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        style={[type.bodyMedium, styles.searchInput]}
      />
      {value.length > 0 && (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={12} onPress={() => onChangeText('')}>
          <X size={18} strokeWidth={2} color={color.content.secondary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    backgroundColor: color.surface.variant,
    borderRadius: radius.md,
  },
  trackStretch: { alignSelf: 'stretch' },
  segment: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentStretch: { flex: 1 },
  segmentSelected: { backgroundColor: color.surface.default, ...elevationSm },
  chipRow: { gap: spacing[8], alignItems: 'center' },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: color.content.primary },
  chipIdle: {
    backgroundColor: color.surface.default,
    borderWidth: 1,
    borderColor: color.border.default,
  },
  search: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    paddingHorizontal: spacing[12],
    backgroundColor: color.surface.default,
    borderWidth: 1,
    borderColor: color.border.default,
    borderRadius: radius.md,
  },
  searchInput: {
    flex: 1,
    color: color.content.primary,
    paddingVertical: 0,
  },
});

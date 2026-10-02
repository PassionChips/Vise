// Input/Amount, Input/Text, Input/Select and Input/Date from the design system.
// The label is always visible above the field; an error replaces the helper
// text, turns the border to 2px Input/BorderError and is announced.

import { Calendar, ChevronDown, CircleAlert, type LucideIcon } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, radius, spacing, type } from '../theme/tokens';

interface FieldFrameProps {
  label: string;
  helperText?: string;
  error?: string;
  children: (fieldStyle: StyleProp<ViewStyle>) => ReactNode;
  focused?: boolean;
  fieldStyle: StyleProp<ViewStyle>;
}

function FieldFrame({ label, helperText, error, focused, fieldStyle, children }: FieldFrameProps) {
  const border = error ? styles.fieldError : focused ? styles.fieldFocused : null;
  return (
    <View style={styles.wrapper}>
      <Text style={[type.label, styles.label]}>{label}</Text>
      {children([styles.field, fieldStyle, border])}
      {error ? (
        <View style={styles.supporting} accessibilityLiveRegion="polite">
          <CircleAlert size={16} color={color.feedback.error} />
          <Text style={[type.bodySmall, styles.errorText]}>{error}</Text>
        </View>
      ) : helperText ? (
        <View style={styles.supporting}>
          <Text style={[type.bodySmall, styles.helperText]}>{helperText}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ----- Amount -----

interface AmountInputProps {
  label: string;
  currency: string;
  currencySymbol: string;
  value: string;
  onChangeText: (value: string) => void;
  helperText?: string;
  error?: string;
  autoFocus?: boolean;
}

/** Keeps digits and a single decimal point; accepts "," as the decimal separator. */
function sanitiseAmount(text: string) {
  const normalised = text.replace(',', '.').replace(/[^0-9.]/g, '');
  const [whole, ...rest] = normalised.split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
}

export function AmountInput({
  label,
  currency,
  currencySymbol,
  value,
  onChangeText,
  helperText,
  error,
  autoFocus,
}: AmountInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <FieldFrame label={label} helperText={helperText} error={error} focused={focused} fieldStyle={styles.amountField}>
      {(fieldStyle) => (
        <View style={fieldStyle}>
          <Text style={[type.numericMedium, styles.secondary]}>{currencySymbol}</Text>
          <TextInput
            accessibilityLabel={label}
            accessibilityHint={helperText}
            value={value}
            onChangeText={(text) => onChangeText(sanitiseAmount(text))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoFocus={autoFocus}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={color.content.secondary}
            selectionColor={color.brand.primary}
            cursorColor={color.brand.primary}
            style={[type.numericMedium, styles.input]}
          />
          <Text style={[type.label, styles.secondary]}>{currency}</Text>
        </View>
      )}
    </FieldFrame>
  );
}

// ----- Text -----

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  helperText?: string;
  error?: string;
}

export function TextField({ label, value, onChangeText, placeholder, helperText, error }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <FieldFrame label={label} helperText={helperText} error={error} focused={focused} fieldStyle={styles.textField}>
      {(fieldStyle) => (
        <View style={fieldStyle}>
          <TextInput
            accessibilityLabel={label}
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            placeholderTextColor={color.content.secondary}
            selectionColor={color.brand.primary}
            cursorColor={color.brand.primary}
            style={[type.bodyLarge, styles.input]}
          />
        </View>
      )}
    </FieldFrame>
  );
}

// ----- Note (multiline) -----

export function NoteField({ label, value, onChangeText, placeholder }: Omit<TextFieldProps, 'helperText' | 'error'>) {
  const [focused, setFocused] = useState(false);
  return (
    <FieldFrame label={label} focused={focused} fieldStyle={styles.noteField}>
      {(fieldStyle) => (
        <View style={fieldStyle}>
          <TextInput
            accessibilityLabel={label}
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            placeholderTextColor={color.content.secondary}
            selectionColor={color.brand.primary}
            cursorColor={color.brand.primary}
            multiline
            textAlignVertical="top"
            style={[type.bodyLarge, styles.input]}
          />
        </View>
      )}
    </FieldFrame>
  );
}

// ----- Select -----

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface SelectFieldProps<T extends string> {
  label: string;
  options: readonly SelectOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  placeholder?: string;
  error?: string;
}

/** Opens a bottom sheet list on mobile. */
export function SelectField<T extends string>({
  label,
  options,
  value,
  onChange,
  placeholder = 'Choose…',
  error,
}: SelectFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const selected = options.find((option) => option.value === value);

  return (
    <FieldFrame label={label} error={error} focused={open} fieldStyle={styles.textField}>
      {(fieldStyle) => (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}, ${selected?.label ?? 'not chosen'}`}
            onPress={() => setOpen(true)}
            style={fieldStyle}
          >
            <Text style={[type.bodyLarge, styles.input, !selected && styles.secondary]}>
              {selected?.label ?? placeholder}
            </Text>
            <ChevronDown size={20} color={color.content.primary} />
          </Pressable>
          <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
            <Pressable style={styles.scrim} accessibilityLabel="Close" onPress={() => setOpen(false)} />
            <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing[8] }]}>
              <Text style={[type.headingMedium, styles.sheetTitle]}>{label}</Text>
              <FlatList
                data={options}
                keyExtractor={(option) => option.value}
                renderItem={({ item }) => {
                  const Icon = item.icon;
                  const isSelected = item.value === value;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => {
                        onChange(item.value);
                        setOpen(false);
                      }}
                      style={({ pressed }) => [styles.sheetRow, (pressed || isSelected) && styles.sheetRowActive]}
                    >
                      {Icon && <Icon size={20} color={isSelected ? color.brand.primary : color.content.primary} />}
                      <Text
                        style={[type.bodyLarge, { color: isSelected ? color.brand.primary : color.content.primary }]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                }}
              />
            </View>
          </Modal>
        </>
      )}
    </FieldFrame>
  );
}

// ----- Date -----

interface DateFieldProps {
  label: string;
  /** Already formatted for display, e.g. "Today, 18/09/2026". */
  displayValue: string;
  onPress?: () => void;
  error?: string;
}

export function DateField({ label, displayValue, onPress, error }: DateFieldProps) {
  return (
    <FieldFrame label={label} error={error} fieldStyle={styles.textField}>
      {(fieldStyle) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${displayValue}`}
          disabled={!onPress}
          onPress={onPress}
          style={fieldStyle}
        >
          <Calendar size={20} color={color.content.primary} />
          <Text style={[type.bodyLarge, styles.input]}>{displayValue}</Text>
        </Pressable>
      )}
    </FieldFrame>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'stretch',
    gap: 6,
  },
  label: {
    color: color.content.primary,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    paddingHorizontal: spacing[16],
    backgroundColor: color.surface.default,
    borderWidth: 1,
    borderColor: color.border.default,
  },
  amountField: {
    height: 64,
    borderRadius: radius.md,
  },
  textField: {
    height: 52,
    borderRadius: radius.sm,
  },
  noteField: {
    height: 96,
    alignItems: 'flex-start',
    paddingVertical: spacing[12],
    borderRadius: radius.sm,
  },
  // 2px borders: shrink the padding by 1px so the content does not shift.
  fieldFocused: {
    borderWidth: 2,
    borderColor: color.brand.primary,
    paddingHorizontal: spacing[16] - 1,
  },
  fieldError: {
    borderWidth: 2,
    borderColor: color.feedback.error,
    paddingHorizontal: spacing[16] - 1,
  },
  input: {
    flex: 1,
    padding: 0,
    // The field border shows focus; hide the browser's own outline on web.
    outlineStyle: 'solid',
    outlineWidth: 0,
    color: color.content.primary,
  },
  secondary: {
    color: color.content.secondary,
  },
  supporting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
  },
  helperText: {
    color: color.content.secondary,
  },
  errorText: {
    flex: 1,
    color: color.feedback.error,
  },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 18, 0.4)',
  },
  sheet: {
    maxHeight: '70%',
    paddingTop: spacing[16],
    paddingHorizontal: spacing[16],
    backgroundColor: color.surface.default,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  sheetTitle: {
    color: color.content.primary,
    paddingHorizontal: spacing[8],
    paddingBottom: spacing[8],
  },
  sheetRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    paddingHorizontal: spacing[8],
    borderRadius: radius.sm,
  },
  sheetRowActive: {
    backgroundColor: color.brand.subtle,
  },
});

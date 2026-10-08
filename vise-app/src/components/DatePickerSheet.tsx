import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { addDays, dayLabel, monthOf } from '../data/calendar';
import { spacing, themed } from '../theme/tokens';
import { Calendar } from './Calendar';
import { FilterChip } from './Controls';
import { BottomSheet } from './Overlays';

interface Props {
  visible: boolean;
  /** The date now chosen, YYYY-MM-DD. */
  value: string;
  today: string;
  onSelect: (date: string) => void;
  onClose: () => void;
}

/**
 * Choose any date: today, a recent day, or one from years ago (or ahead). Jump with the quick chips, step
 * through months, or tap the month to pick a month and year. Choosing a day closes the sheet.
 */
export function DatePickerSheet({ visible, value, today, onSelect, onClose }: Props) {
  const [month, setMonth] = useState(monthOf(value));
  // Opening the sheet starts at the chosen date's month, wherever the user was browsing last time.
  useEffect(() => {
    if (visible) setMonth(monthOf(value));
  }, [visible, value]);

  const choose = (date: string) => {
    onSelect(date);
    onClose();
  };
  const quick = [
    { label: 'Today', date: today },
    { label: 'Yesterday', date: addDays(today, -1) },
    { label: 'A week ago', date: addDays(today, -7) },
  ];

  return (
    <BottomSheet visible={visible} title="Choose a date" onClose={onClose}>
      <View style={styles.body}>
        <View style={styles.quick}>
          {quick.map((q) => (
            <FilterChip key={q.label} label={q.label} selected={value === q.date} onPress={() => choose(q.date)} />
          ))}
        </View>
        <Calendar month={month} onMonthChange={setMonth} selected={value} today={today} onSelect={choose} />
      </View>
    </BottomSheet>
  );
}

export { dayLabel };

const styles = themed(() => ({
  body: { gap: spacing[12], paddingBottom: spacing[8] },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
}));

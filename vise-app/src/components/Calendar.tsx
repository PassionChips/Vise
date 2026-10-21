import { ChevronDown } from 'lucide-react-native';
import { memo, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import {
  compactMoney,
  dayLabel,
  dayLevel,
  FIRST_YEAR,
  LAST_YEAR,
  monthGrid,
  monthOf,
  weekdayLabels,
  withMonth,
  withYear,
  type DayInfo,
  type DayLevel,
} from '../data/calendar';
import { formatMoney, monthLabel, shiftMonth } from '../format';
import { color, radius, spacing, themed, type } from '../theme/tokens';
import { TertiaryButton } from './Buttons';
import { MonthPager } from './MonthPager';
import { WheelPicker, type WheelItem } from './WheelPicker';

/** Spending per day, shown inside the cells. Leave out for a plain date picker. */
export interface CalendarInsights {
  days: Record<string, DayInfo>;
  currency: string;
  symbol: string;
  /** The monthly limit spread over the days, or null if there is no limit. */
  allowance: number | null;
}

interface CalendarProps {
  /** The month shown, YYYY-MM. */
  month: string;
  onMonthChange: (month: string) => void;
  /** YYYY-MM-DD, highlighted. */
  selected?: string | null;
  onSelect: (date: string) => void;
  today: string;
  /** Daily spending by month. Months without an entry show plain days. Leave out for a date picker. */
  insightsByMonth?: Record<string, CalendarInsights | undefined>;
}

const MONTH_ITEMS: WheelItem<number>[] = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
].map((label, i) => ({ value: i + 1, label }));

const YEAR_ITEMS: WheelItem<number>[] = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => ({
  value: FIRST_YEAR + i,
  label: String(FIRST_YEAR + i),
}));

const ROW_GAP = 4;
const WEEKDAY_ROW = 24;

/** The wash behind a day: green when healthy, a soft red that deepens with spending. */
const tint = (level: DayLevel, hasIncome: boolean): string | undefined => {
  if (level === 'none') return hasIncome ? color.heat.income : undefined;
  return level === 'under' ? color.heat.under : color.heat[level];
};

/**
 * A month calendar you move through with your hands: swipe sideways for the next or previous month (a flick keeps
 * going across several), or tap the month name for a month and a year wheel. As a date picker it shows plain days;
 * with `insightsByMonth` each day also shows what was spent, tinted by how heavy the day was.
 */
export function Calendar({ month, onMonthChange, selected, onSelect, today, insightsByMonth }: CalendarProps) {
  const [choosing, setChoosing] = useState(false);
  // The title follows the swipe while it is still moving; `month` only changes when it settles.
  const [live, setLive] = useState(month);
  useEffect(() => setLive(month), [month]);

  const insightsMode = insightsByMonth != null;
  const cellHeight = insightsMode ? 56 : 46;
  const pageHeight = 6 * cellHeight + 5 * ROW_GAP;
  const wheelRowHeight = 48;
  const areaHeight = pageHeight + WEEKDAY_ROW;
  const wheelRows = Math.max(3, 2 * Math.floor(areaHeight / wheelRowHeight / 2) + 1);

  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel={`${monthLabel(live)}. Choose month and year`}
          accessibilityHint="Swipe up or down to change the month"
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => onMonthChange(shiftMonth(month, e.nativeEvent.actionName === 'increment' ? 1 : -1))}
          accessibilityState={{ expanded: choosing }}
          onPress={() => setChoosing((v) => !v)}
          style={({ pressed }) => [styles.title, pressed && styles.pressed]}
        >
          <Text style={[type.headingMedium, styles.primary]}>{monthLabel(live)}</Text>
          <ChevronDown size={18} color={color.content.secondary} style={choosing ? styles.flipped : undefined} />
        </Pressable>
        {monthOf(today) !== live && (
          <TertiaryButton
            label="Today"
            size="large"
            onPress={() => {
              setChoosing(false);
              onMonthChange(monthOf(today));
            }}
          />
        )}
      </View>

      {choosing ? (
        <Animated.View entering={FadeIn.duration(140)} style={[styles.wheels, { height: areaHeight }]}>
          <WheelPicker
            items={MONTH_ITEMS}
            value={monthNumber}
            onChange={(m) => onMonthChange(withMonth(month, m))}
            accessibilityLabel="Month"
            rowHeight={wheelRowHeight}
            visibleRows={wheelRows}
          />
          <WheelPicker
            items={YEAR_ITEMS}
            value={year}
            onChange={(y) => onMonthChange(withYear(month, y))}
            accessibilityLabel="Year"
            rowHeight={wheelRowHeight}
            visibleRows={wheelRows}
          />
        </Animated.View>
      ) : (
        <>
          <View style={[styles.weekdays, { height: WEEKDAY_ROW }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {weekdayLabels().map((label) => (
              <Text key={label} style={[type.label, styles.secondary, styles.weekday]}>
                {label}
              </Text>
            ))}
          </View>
          <MonthPager
            month={month}
            onMonthChange={onMonthChange}
            onLiveMonth={setLive}
            pageHeight={pageHeight}
            renderMonth={(m) => (
              <MonthGrid
                month={m}
                cellHeight={cellHeight}
                selected={selected ?? null}
                today={today}
                insights={insightsByMonth?.[m]}
                onSelect={onSelect}
              />
            )}
          />
        </>
      )}
    </View>
  );
}

interface MonthGridProps {
  month: string;
  cellHeight: number;
  selected: string | null;
  today: string;
  insights?: CalendarInsights;
  onSelect: (date: string) => void;
}

const MonthGrid = memo(function MonthGrid({ month, cellHeight, selected, today, insights, onSelect }: MonthGridProps) {
  const grid = useMemo(() => monthGrid(month), [month]);
  const biggestDay = useMemo(
    () => (insights ? Math.max(0, ...Object.values(insights.days).map((d) => d.spent)) : 0),
    [insights],
  );

  return (
    <View style={styles.grid}>
      {grid.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((cell, cellIndex) => {
            if (!cell) return <View key={cellIndex} style={styles.cell} />;
            const info = insights?.days[cell.date];
            const level = info ? dayLevel(info.spent, insights?.allowance ?? null, biggestDay) : 'none';
            const income = (info?.income ?? 0) > 0;
            const isSelected = selected === cell.date;
            const isToday = today === cell.date;
            const activity =
              insights == null
                ? ''
                : info && (info.spent > 0 || income)
                  ? `, ${[
                      info.spent > 0 ? `spent ${formatMoney(info.spent, { currency: insights.currency })}` : null,
                      income ? `income ${formatMoney(info.income, { currency: insights.currency })}` : null,
                    ]
                      .filter(Boolean)
                      .join(', ')}`
                  : ', no activity';
            return (
              <Pressable
                key={cellIndex}
                accessibilityRole="button"
                accessibilityLabel={`${dayLabel(cell.date)}${isToday ? ', today' : ''}${activity}`}
                accessibilityState={{ selected: isSelected }}
                onPress={() => onSelect(cell.date)}
                style={({ pressed }) => [
                  styles.cell,
                  { height: cellHeight, backgroundColor: tint(level, income) },
                  isToday && styles.today,
                  isSelected && styles.selected,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[type.bodyMedium, styles.day, { color: isToday ? color.brand.primary : color.content.primary }, isSelected && styles.daySelected]}>
                  {cell.day}
                </Text>
                {insights && info && info.spent > 0 && (
                  <Text numberOfLines={1} style={[styles.amount, { color: level === 'under' ? color.finance.remaining : color.content.primary }]}>
                    {compactMoney(info.spent, insights.symbol)}
                  </Text>
                )}
                {insights && info && info.spent <= 0 && income && (
                  <Text numberOfLines={1} style={[styles.amount, { color: color.finance.remaining }]}>
                    +{compactMoney(info.income, insights.symbol)}
                  </Text>
                )}
                {insights && income && info!.spent > 0 && <View style={styles.incomeDot} />}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
});

/** What the tints mean. Wording follows whether the month has a limit. */
export function CalendarLegend({ hasAllowance }: { hasAllowance: boolean }) {
  const items: { tint: string; label: string }[] = hasAllowance
    ? [
        { tint: color.heat.under, label: 'Within budget' },
        { tint: color.heat.mid, label: 'Over' },
        { tint: color.heat.high, label: 'Well over' },
      ]
    : [
        { tint: color.heat.low, label: 'Light' },
        { tint: color.heat.mid, label: 'Medium' },
        { tint: color.heat.high, label: 'Heavy' },
      ];
  return (
    <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: item.tint }]} />
          <Text style={[type.bodySmall, styles.secondary]}>{item.label}</Text>
        </View>
      ))}
      <View style={styles.legendItem}>
        <View style={[styles.swatch, { backgroundColor: color.heat.income }]} />
        <Text style={[type.bodySmall, styles.secondary]}>Income</Text>
      </View>
    </View>
  );
}

const styles = themed(() => ({
  // On a wide screen the calendar stays a readable size instead of stretching.
  wrap: { gap: spacing[8], width: '100%', maxWidth: 480, alignSelf: 'center' },
  primary: { color: color.content.primary },
  secondary: { color: color.content.secondary },
  pressed: { opacity: 0.7 },
  flipped: { transform: [{ rotate: '180deg' }] },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  title: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], minHeight: 44, paddingRight: spacing[12], borderRadius: radius.md },
  weekdays: { flexDirection: 'row', alignItems: 'center' },
  weekday: { flex: 1, textAlign: 'center' },
  wheels: { flexDirection: 'row', gap: spacing[8] },
  grid: { gap: ROW_GAP },
  row: { flexDirection: 'row', gap: ROW_GAP },
  cell: { flex: 1, minHeight: 44, borderRadius: radius.sm + 4, alignItems: 'center', justifyContent: 'center', gap: 1, borderWidth: 1, borderColor: 'transparent' },
  today: { borderColor: color.brand.primary },
  selected: { borderWidth: 2, borderColor: color.brand.primary },
  day: { textAlign: 'center' },
  daySelected: { fontFamily: type.button.fontFamily },
  amount: { fontFamily: type.numericSmall.fontFamily, fontSize: 10.5, lineHeight: 13 },
  incomeDot: { position: 'absolute', top: 5, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: color.finance.remaining },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[12], justifyContent: 'center', paddingTop: spacing[4] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  swatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1, borderColor: color.glass.border },
}));

import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { wheelIndex } from '../data/calendar';
import { tick } from '../data/haptics';
import { color, radius, themed, type } from '../theme/tokens';

export interface WheelItem<T> {
  value: T;
  label: string;
}

interface Props<T> {
  items: readonly WheelItem<T>[];
  value: T;
  /** Called once the wheel has settled on a row, never while it is still moving. */
  onChange: (value: T) => void;
  accessibilityLabel: string;
  rowHeight?: number;
  /** How many rows are visible; odd, so one sits under the selection band. */
  visibleRows?: number;
}

/**
 * A scrolling wheel: flick it and it keeps its momentum, then snaps to a row. A light tick marks each row that
 * passes under the selection band. There is no confirm button: the row it rests on is the choice.
 * Screen readers can step it up and down.
 */
export function WheelPicker<T extends string | number>({ items, value, onChange, accessibilityLabel, rowHeight = 44, visibleRows = 5 }: Props<T>) {
  const ref = useRef<ScrollView>(null);
  const selected = Math.max(0, items.findIndex((item) => item.value === value));
  const [live, setLive] = useState(selected);
  const lastTick = useRef(selected);
  const placed = useRef(false);
  const padding = ((visibleRows - 1) / 2) * rowHeight;

  // Follow the chosen value when something else changes it (the calendar was swiped, "Today" was tapped).
  useEffect(() => {
    lastTick.current = selected;
    setLive(selected);
    ref.current?.scrollTo({ y: selected * rowHeight, animated: false });
  }, [selected, rowHeight]);

  const rowAt = (event: NativeSyntheticEvent<NativeScrollEvent>) => wheelIndex(event.nativeEvent.contentOffset.y, rowHeight, items.length);

  const commit = (index: number) => {
    const next = items[index];
    if (next && next.value !== value) onChange(next.value);
  };

  const step = (delta: number) => {
    const index = Math.min(items.length - 1, Math.max(0, selected + delta));
    ref.current?.scrollTo({ y: index * rowHeight, animated: true });
    commit(index);
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: items[selected]?.label }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      style={[styles.wheel, { height: rowHeight * visibleRows }]}
    >
      <View pointerEvents="none" style={[styles.band, { top: padding, height: rowHeight }]} />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={rowHeight}
        decelerationRate="fast"
        scrollEventThrottle={16}
        contentOffset={{ x: 0, y: selected * rowHeight }}
        contentContainerStyle={{ paddingVertical: padding }}
        // Android ignores `contentOffset`, so place the wheel on its row as soon as it has a size.
        onContentSizeChange={() => {
          if (placed.current) return;
          placed.current = true;
          ref.current?.scrollTo({ y: selected * rowHeight, animated: false });
        }}
        onScroll={(event) => {
          const index = rowAt(event);
          if (index !== lastTick.current) {
            lastTick.current = index;
            setLive(index);
            tick();
          }
        }}
        onMomentumScrollEnd={(event) => commit(rowAt(event))}
        onScrollEndDrag={(event) => {
          // A slow release has no momentum; the snap still lands on a row.
          if (Math.abs(event.nativeEvent.velocity?.y ?? 0) < 0.05) commit(rowAt(event));
        }}
      >
        {items.map((item, index) => (
          <Pressable
            key={String(item.value)}
            accessible={false}
            importantForAccessibility="no"
            onPress={() => {
              ref.current?.scrollTo({ y: index * rowHeight, animated: true });
              commit(index);
            }}
            style={[styles.row, { height: rowHeight }]}
          >
            <Text style={[type.bodyLarge, { color: index === live ? color.content.primary : color.content.secondary, fontWeight: index === live ? '600' : '400', opacity: index === live ? 1 : 0.55 }]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = themed(() => ({
  wheel: { flex: 1, overflow: 'hidden' },
  band: {
    position: 'absolute',
    left: 4,
    right: 4,
    borderRadius: radius.md,
    backgroundColor: color.glass.inner,
    borderWidth: 1,
    borderColor: color.glass.border,
  },
  row: { alignItems: 'center', justifyContent: 'center' },
}));

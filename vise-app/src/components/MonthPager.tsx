import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FlatList, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { MONTH_COUNT, monthAt, monthIndex } from '../data/calendar';
import { tick } from '../data/haptics';

/** One entry per month from January 1990 to December 2100. */
const MONTHS = Array.from({ length: MONTH_COUNT }, (_, i) => i);

interface Props {
  /** The month the pager rests on. */
  month: string;
  /** A swipe has settled on another month. */
  onMonthChange: (month: string) => void;
  /** The month currently nearest the middle, while still moving (to update a title as you swipe). */
  onLiveMonth?: (month: string) => void;
  renderMonth: (month: string) => ReactNode;
  /** Months differ in length, so every page has the same height and the calendar never jumps. */
  pageHeight: number;
}

/**
 * Months you swipe through sideways. A flick keeps its momentum across several months and then snaps to one; a
 * light tick marks each month that passes. Only the few pages near the screen are drawn, so the long range
 * costs nothing.
 */
export function MonthPager({ month, onMonthChange, onLiveMonth, renderMonth, pageHeight }: Props) {
  const [width, setWidth] = useState(0);
  const ref = useRef<FlatList<number>>(null);
  const live = useRef(monthIndex(month));

  // Another part of the screen chose the month (the wheels, "Today"): go there without an animation.
  useEffect(() => {
    const index = monthIndex(month);
    if (width > 0 && index !== live.current) {
      live.current = index;
      ref.current?.scrollToIndex({ index, animated: false });
    }
  }, [month, width]);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width === 0) return;
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    live.current = index;
    const next = monthAt(index);
    if (next !== month) onMonthChange(next);
  };

  return (
    <View style={{ height: pageHeight }} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      {width > 0 && (
        <FlatList
          ref={ref}
          horizontal
          data={MONTHS}
          keyExtractor={(i) => String(i)}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          initialScrollIndex={monthIndex(month)}
          initialNumToRender={1}
          windowSize={5}
          maxToRenderPerBatch={3}
          showsHorizontalScrollIndicator={false}
          snapToInterval={width}
          snapToAlignment="start"
          decelerationRate="fast"
          scrollEventThrottle={16}
          onScroll={(event) => {
            const index = Math.round(event.nativeEvent.contentOffset.x / width);
            if (index !== live.current && index >= 0 && index < MONTH_COUNT) {
              live.current = index;
              onLiveMonth?.(monthAt(index));
              tick();
            }
          }}
          onMomentumScrollEnd={settle}
          onScrollEndDrag={(event) => {
            if (Math.abs(event.nativeEvent.velocity?.x ?? 0) < 0.05) settle(event);
          }}
          renderItem={({ item }) => <View style={{ width, height: pageHeight }}>{renderMonth(monthAt(item))}</View>}
        />
      )}
    </View>
  );
}

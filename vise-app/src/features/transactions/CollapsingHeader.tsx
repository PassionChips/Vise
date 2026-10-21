import { useEffect, useState, type ReactNode } from 'react';
import { Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '../../components/Glass';
import { color, spacing, themed } from '../../theme/tokens';

interface Props {
  /** The list's vertical scroll offset, from `Animated.event` with the native driver. */
  scrollY: Animated.Value;
  /** The part that slides away as you scroll: the title and the big balance. */
  top: ReactNode;
  /** Left of the always-visible row while the header is expanded (the month). */
  expandedLeft: ReactNode;
  /** Left of the always-visible row once scrolled (the compact summary). */
  collapsedLeft: ReactNode;
  /** Right of the always-visible row (calendar and add). */
  right: ReactNode;
  /** Always visible below that row: search, filters. */
  children: ReactNode;
  /** The full header height and the height of the part that slides away, once measured. */
  onMeasure: (sizes: { header: number; top: number }) => void;
}

/**
 * A header that stays on screen. Its top part moves up in step with the list and fades out, leaving the compact
 * summary and the controls where they are, so the financial context never scrolls away. Only transforms and
 * opacity change (no re-layout), so it stays smooth, and nothing here touches the numbers.
 */
export function CollapsingHeader({ scrollY, top, expandedLeft, collapsedLeft, right, children, onMeasure }: Props) {
  const insets = useSafeAreaInsets();
  const [topHeight, setTopHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  // Whether the compact summary has taken over: decides which of the two left slots can be tapped.
  const [collapsed, setCollapsed] = useState(false);

  const range = Math.max(topHeight, 1);
  const clamp = 'clamp' as const;
  const translateY = scrollY.interpolate({ inputRange: [0, range], outputRange: [0, -topHeight], extrapolate: clamp });
  const topOpacity = scrollY.interpolate({ inputRange: [0, range * 0.65], outputRange: [1, 0], extrapolate: clamp });
  const expandedOpacity = scrollY.interpolate({ inputRange: [range * 0.3, range * 0.7], outputRange: [1, 0], extrapolate: clamp });
  const collapsedOpacity = scrollY.interpolate({ inputRange: [range * 0.45, range * 0.9], outputRange: [0, 1], extrapolate: clamp });

  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      const next = value > range * 0.6;
      setCollapsed((current) => (current === next ? current : next));
    });
    return () => scrollY.removeListener(id);
  }, [scrollY, range]);

  useEffect(() => {
    if (topHeight > 0 && headerHeight > 0) onMeasure({ header: headerHeight, top: topHeight });
  }, [topHeight, headerHeight, onMeasure]);

  return (
    <>
      {/* The height is measured here, on the whole header with its padding. A transform never changes it. */}
      <Animated.View
        pointerEvents="box-none"
        onLayout={(e) => setHeaderHeight(Math.ceil(e.nativeEvent.layout.height))}
        style={[styles.wrap, { transform: [{ translateY }] }]}
      >
        <Glass
          style={[styles.header, { paddingTop: insets.top + spacing[8] }]}
          intensity={55}
        >
          <View style={styles.measure}>
            <View onLayout={(e) => setTopHeight(Math.ceil(e.nativeEvent.layout.height))}>
              <Animated.View style={{ opacity: topOpacity }}>{top}</Animated.View>
            </View>

            <View style={styles.row}>
              <View style={styles.left}>
                <Animated.View pointerEvents={collapsed ? 'none' : 'auto'} style={{ opacity: expandedOpacity }}>
                  {expandedLeft}
                </Animated.View>
                <Animated.View pointerEvents="none" style={[styles.overlay, { opacity: collapsedOpacity }]}>
                  {collapsedLeft}
                </Animated.View>
              </View>
              <View style={styles.right}>{right}</View>
            </View>

            {children}
          </View>
        </Glass>
      </Animated.View>

      {/* Once the top part has slid away, the status bar area keeps a frosted strip so content never shows through it. */}
      <Animated.View pointerEvents="none" style={[styles.scrim, { height: insets.top, opacity: collapsedOpacity }]}>
        <Glass style={styles.scrimGlass} intensity={55}>
          <View />
        </Glass>
      </Animated.View>
    </>
  );
}

const styles = themed(() => ({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  measure: { gap: spacing[8] },
  header: {
    paddingHorizontal: spacing[16],
    paddingBottom: spacing[12],
    borderRadius: 0,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderWidth: 0,
    borderBottomWidth: 1,
    borderColor: color.glass.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[8], minHeight: 48 },
  // Clipped at the buttons: nothing in the left slot may run underneath them.
  left: { flex: 1, minWidth: 0, overflow: 'hidden', justifyContent: 'center', minHeight: 44 },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center', minWidth: 0 },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  scrimGlass: { flex: 1, borderRadius: 0, borderWidth: 0 },
}));

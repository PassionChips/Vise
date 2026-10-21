import type { BottomTabBarProps } from 'expo-router/tabs';
import {
  ChartNoAxesCombined,
  LayoutDashboard,
  type LucideIcon,
  ReceiptText,
  Settings,
  Wallet,
} from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';

import { color, radius, spacing, themed, type } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { GlassSurface, PressableScale, useBlurHost, useReduceMotion } from './Glass';

/** Route name → tab icon and label, in the fixed design order. */
export const TABS: Record<string, { label: string; icon: LucideIcon }> = {
  index: { label: 'Dashboard', icon: LayoutDashboard },
  transactions: { label: 'Transactions', icon: ReceiptText },
  budgets: { label: 'Budgets', icon: Wallet },
  reports: { label: 'Reports', icon: ChartNoAxesCombined },
  settings: { label: 'Settings', icon: Settings },
};

const BAR_HEIGHT = 64;
const FLOAT_GAP = spacing[12];

/** Navigation/BottomBar: a floating glass bar; screens scroll underneath it. */
export function BottomNavigation({ state, navigation, insets }: BottomTabBarProps) {
  useTheme();
  const host = useBlurHost();
  const bottom = Math.max(insets.bottom, FLOAT_GAP);

  // Tell the screens how much space the floating bar covers.
  const setBottomInset = host?.setBottomInset;
  useEffect(() => {
    setBottomInset?.(BAR_HEIGHT + bottom + spacing[8]);
  }, [setBottomInset, bottom]);

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: bottom }]}>
      <GlassSurface accessibilityRole="tablist" strong blurTarget={host?.target} intensity={60} style={styles.bar}>
        {state.routes.map((route, index) => {
          const tab = TABS[route.name];
          if (!tab) return null;
          const active = state.index === index;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!active && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          return <TabItem key={route.key} icon={tab.icon} label={tab.label} active={active} onPress={onPress} />;
        })}
      </GlassSurface>
    </View>
  );
}

function TabItem({ icon: Icon, label, active, onPress }: { icon: LucideIcon; label: string; active: boolean; onPress: () => void }) {
  const reduceMotion = useReduceMotion();
  // The active pill grows in rather than appearing.
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(active ? 1 : 0);
      return;
    }
    Animated.spring(progress, { toValue: active ? 1 : 0, speed: 18, bounciness: 4, useNativeDriver: true }).start();
  }, [active, reduceMotion, progress]);
  const tint = active ? color.brand.primary : color.content.secondary;

  return (
    <PressableScale
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      scaleTo={0.92}
      style={styles.item}
    >
      <View style={styles.indicator}>
        <Animated.View style={[styles.indicatorFill, { opacity: progress, transform: [{ scaleX: progress }] }]} />
        <Icon size={22} strokeWidth={active ? 2.25 : 2} color={tint} />
      </View>
      <Text numberOfLines={1} style={[type.label, styles.label, { color: tint }]}>{label}</Text>
    </PressableScale>
  );
}

const styles = themed(() => ({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing[8],
  },
  bar: {
    height: BAR_HEIGHT,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 0,
    borderRadius: radius.xl,
  },
  item: {
    flex: 1,
    height: BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  indicator: {
    width: 52,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 11, letterSpacing: 0 },
  indicatorFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.full,
    backgroundColor: color.brand.subtle,
  },
}));


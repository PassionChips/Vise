import type { BottomTabBarProps } from 'expo-router/tabs';
import {
  ChartNoAxesCombined,
  LayoutDashboard,
  type LucideIcon,
  ReceiptText,
  Settings,
  Wallet,
} from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { color, radius, spacing, themed, type } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

/** Route name → tab icon and label, in the fixed design order. */
export const TABS: Record<string, { label: string; icon: LucideIcon }> = {
  index: { label: 'Dashboard', icon: LayoutDashboard },
  transactions: { label: 'Transactions', icon: ReceiptText },
  budgets: { label: 'Budgets', icon: Wallet },
  reports: { label: 'Reports', icon: ChartNoAxesCombined },
  settings: { label: 'Settings', icon: Settings },
};

/** Navigation/BottomBar: height 64 + bottom safe-area inset. */
export function BottomNavigation({ state, navigation, insets }: BottomTabBarProps) {
  useTheme();
  return (
    <View accessibilityRole="tablist" style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {state.routes.map((route, index) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const active = state.index === index;
        const Icon = tab.icon;
        const tint = active ? color.brand.primary : color.content.secondary;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!active && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            onPress={onPress}
            style={styles.item}
          >
            <View style={[styles.indicator, active && styles.indicatorActive]}>
              <Icon size={22} strokeWidth={2} color={tint} />
            </View>
            <Text numberOfLines={1} style={[type.label, { color: tint }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themed(() => ({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing[8],
    paddingHorizontal: spacing[8],
    backgroundColor: color.surface.default,
    borderTopWidth: 1,
    borderTopColor: color.border.default,
  },
  item: {
    minWidth: 64,
    height: 56,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  indicator: {
    width: 56,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorActive: { backgroundColor: color.brand.subtle },
}));

import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, spacing, themed, type } from '../theme/tokens';
import { IconButton } from './Buttons';

interface ScreenProps {
  children: ReactNode;
  /** Rendered above the scrolling content (e.g. a TopAppBar). */
  header?: ReactNode;
  /** Vertical gap between direct children of the content. */
  gap?: number;
  contentStyle?: StyleProp<ViewStyle>;
}

/** Background, top safe area and a padded scroll view (24px sides). */
export function Screen({ children, header, gap = spacing[16], contentStyle }: ScreenProps) {
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      {header}
      <ScrollView contentContainerStyle={[styles.content, { gap }, contentStyle]}>{children}</ScrollView>
    </SafeAreaView>
  );
}

interface TopAppBarProps {
  title: string;
  /** large = tab root (title left, Heading/Large); standard = pushed screen with back. */
  variant?: 'large' | 'standard';
  action?: ReactNode;
}

/** Navigation/TopBar. */
export function TopAppBar({ title, variant = 'large', action }: TopAppBarProps) {
  if (variant === 'standard') {
    return (
      <View style={[styles.bar, styles.barStandard]}>
        <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
        <Text accessibilityRole="header" style={[type.headingMedium, styles.titleStandard]}>{title}</Text>
        {action ?? <View style={styles.actionPlaceholder} />}
      </View>
    );
  }
  return (
    <View style={[styles.bar, styles.barLarge]}>
      <Text accessibilityRole="header" style={[type.headingLarge, styles.titleLarge]}>{title}</Text>
      {action}
    </View>
  );
}

/** Screen title row used inside the content (Transactions, Budgets). */
export function ScreenHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.screenHeader}>
      <Text accessibilityRole="header" style={[type.headingLarge, { color: color.content.primary }]}>{title}</Text>
      {action}
    </View>
  );
}

/** Heading/Medium section title with an optional trailing element. */
export function SectionHeader({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text accessibilityRole="header" style={[type.headingMedium, { color: color.content.primary }]}>{title}</Text>
      {trailing}
    </View>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.surface.background },
  content: {
    paddingTop: spacing[8],
    paddingHorizontal: spacing[24],
    paddingBottom: spacing[24],
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: color.surface.background,
  },
  barLarge: { height: 64, paddingLeft: spacing[24], paddingRight: spacing[16] },
  barStandard: { height: 56, paddingLeft: spacing[8], paddingRight: spacing[16] },
  titleLarge: { flex: 1, color: color.content.primary },
  titleStandard: { flex: 1, textAlign: 'center', color: color.content.primary },
  actionPlaceholder: { width: 44 },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
}));

import { router } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Platform, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, spacing, themed, type } from '../theme/tokens';
import { IconButton, TertiaryButton } from './Buttons';
import { AmbientGlow, BlurTarget, useBlurHost } from './Glass';

interface ScreenProps {
  children: ReactNode;
  /** Rendered above the scrolling content (e.g. a TopAppBar). */
  header?: ReactNode;
  /** Vertical gap between direct children of the content. */
  gap?: number;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * Background with ambient glow, top safe area and a padded scroll view (24px sides).
 * Inside the tabs, content scrolls under the floating glass tab bar.
 */
export function Screen({ children, header, gap = spacing[16], contentStyle }: ScreenProps) {
  const bottomInset = useBlurHost()?.bottomInset ?? 0;
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <BlurTarget style={styles.flex}>
        <AmbientGlow />
        {header}
        <ScrollView
          contentContainerStyle={[styles.content, { gap, paddingBottom: spacing[24] + bottomInset }, contentStyle]}
        >
          {children}
        </ScrollView>
      </BlurTarget>
    </SafeAreaView>
  );
}

/** Android forms save from the top bar (Navigation/TopBar · Type=Form); iOS forms keep a Save button at the bottom. */
export const SAVE_IN_TOP_BAR = Platform.OS === 'android';

interface TopAppBarProps {
  title: string;
  /**
   * large = tab root (title left, Heading/Large); standard = pushed screen with back;
   * form = full-screen form with close.
   */
  variant?: 'large' | 'standard' | 'form';
  action?: ReactNode;
  /** form only: the Save text action, shown on Android. */
  onSave?: () => void;
  saveLabel?: string;
  saving?: boolean;
}

/** Navigation/TopBar. */
export function TopAppBar({ title, variant = 'large', action, onSave, saveLabel = 'Save', saving }: TopAppBarProps) {
  if (variant === 'form') {
    const close = <IconButton icon={X} accessibilityLabel="Close" onPress={() => router.back()} />;
    if (!SAVE_IN_TOP_BAR) {
      return (
        <View style={[styles.bar, styles.barStandard, styles.barForm]}>
          <View style={styles.actionPlaceholder} />
          <Text accessibilityRole="header" style={[type.headingMedium, styles.titleStandard]}>{title}</Text>
          {close}
        </View>
      );
    }
    return (
      <View style={[styles.bar, styles.barStandard]}>
        {close}
        <Text accessibilityRole="header" numberOfLines={1} style={[type.headingMedium, styles.titleLarge]}>{title}</Text>
        {onSave && (
          <TertiaryButton
            label={saving ? 'Saving…' : saveLabel}
            accessibilityLabel={saving ? 'Saving' : saveLabel}
            onPress={saving ? undefined : onSave}
          />
        )}
      </View>
    );
  }
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
  flex: { flex: 1 },
  content: {
    paddingTop: spacing[8],
    paddingHorizontal: spacing[24],
    paddingBottom: spacing[24],
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  barLarge: { height: 64, paddingLeft: spacing[24], paddingRight: spacing[16] },
  barStandard: { height: 56, paddingLeft: spacing[8], paddingRight: spacing[8] },
  barForm: { paddingHorizontal: spacing[16] },
  titleLarge: { flex: 1, color: color.content.primary },
  // Centred on iOS, left-aligned on Android.
  titleStandard: { flex: 1, textAlign: Platform.OS === 'ios' ? 'center' : 'left', color: color.content.primary },
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

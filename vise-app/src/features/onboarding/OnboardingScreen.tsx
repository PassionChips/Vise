// Shared scaffold for every onboarding step: optional stepper, a heading,
// the step's content, a flexible spacer and the actions pinned to the bottom.

import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton, TertiaryButton } from '../../components/Buttons';
import { ProgressBar } from '../../components/ProgressBar';
import { color, spacing, themed, type } from '../../theme/tokens';

export interface StepperProps {
  step: number;
  total: number;
  onBack: () => void;
  onSkip: () => void;
}

function Stepper({ step, total, onBack, onSkip }: StepperProps) {
  return (
    <View style={styles.stepper}>
      <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={onBack} />
      <View style={styles.progress}>
        <ProgressBar value={step / total} accessibilityLabel={`Step ${step} of ${total}`} />
      </View>
      <Text style={[type.label, styles.stepLabel]}>
        {step} of {total}
      </Text>
      <TertiaryButton label="Skip" size="small" onPress={onSkip} />
    </View>
  );
}

export function Heading({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.heading}>
      <Text accessibilityRole="header" style={[type.headingLarge, styles.title]}>
        {title}
      </Text>
      <Text style={[type.bodyMedium, styles.description]}>{description}</Text>
    </View>
  );
}

interface OnboardingScreenProps {
  stepper?: StepperProps;
  children: ReactNode;
  actions: ReactNode;
  /** Vertical rhythm between blocks; the design uses 24 or 20. */
  gap?: number;
}

export function OnboardingScreen({ stepper, children, actions, gap = spacing[24] }: OnboardingScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { gap }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {stepper && <Stepper {...stepper} />}
          {children}
          <View style={styles.flex} />
          <View style={styles.actions}>{actions}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  safeArea: {
    flex: 1,
    backgroundColor: color.surface.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing[24],
    paddingTop: spacing[8],
    paddingBottom: spacing[24],
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
  },
  progress: {
    flex: 1,
  },
  stepLabel: {
    color: color.content.secondary,
  },
  heading: {
    gap: spacing[8],
  },
  title: {
    color: color.content.primary,
  },
  description: {
    color: color.content.secondary,
  },
  actions: {
    gap: spacing[8],
  },
}));

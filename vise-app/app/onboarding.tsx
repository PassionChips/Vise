import { router } from 'expo-router';

import { OnboardingFlow } from '../src/features/onboarding/OnboardingFlow';
import { useTheme } from '../src/theme/ThemeProvider';

/** The flow saves through rust-core before `onFinish`; the tabs then read the saved settings. */
export default function OnboardingRoute() {
  useTheme();
  return <OnboardingFlow onFinish={() => router.replace('/')} onRestore={() => router.push('/restore')} />;
}

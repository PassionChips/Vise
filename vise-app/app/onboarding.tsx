import { router } from 'expo-router';

import { OnboardingFlow } from '../src/features/onboarding/OnboardingFlow';

/** The flow saves through rust-core before `onFinish`; the tabs then read the saved settings. */
export default function OnboardingRoute() {
  return <OnboardingFlow onFinish={() => router.replace('/')} />;
}

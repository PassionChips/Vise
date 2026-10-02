import { router } from 'expo-router';

import { OnboardingFlow } from '../src/features/onboarding/OnboardingFlow';
import { markOnboardingComplete } from '../src/features/onboarding/status';

export default function OnboardingRoute() {
  const enterApp = () => {
    markOnboardingComplete();
    router.replace('/');
  };

  // Until the bridge exists the tabs render demo data, so both paths land there.
  return <OnboardingFlow onFinish={enterApp} onExploreDemo={enterApp} />;
}

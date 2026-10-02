import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OnboardingFlow } from './src/features/onboarding/OnboardingFlow';
import { fontAssets } from './src/theme';

export default function App() {
  const [fontsLoaded] = useFonts(fontAssets);
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {/* The dashboard and demo data are not built yet; both callbacks are placeholders. */}
      <OnboardingFlow onFinish={() => {}} onExploreDemo={() => {}} />
    </SafeAreaProvider>
  );
}

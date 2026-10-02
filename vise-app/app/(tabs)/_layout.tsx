import { Redirect, Tabs } from 'expo-router';

import { BottomNavigation } from '../../src/components/BottomNavigation';
import { hasCompletedOnboarding } from '../../src/features/onboarding/status';
import { color } from '../../src/theme/tokens';

export default function TabsLayout() {
  if (!hasCompletedOnboarding()) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <Tabs
      tabBar={(props) => <BottomNavigation {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.surface.background } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="transactions" options={{ title: 'Transactions' }} />
      <Tabs.Screen name="budgets" options={{ title: 'Budgets' }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

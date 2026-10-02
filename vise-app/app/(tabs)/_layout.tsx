import { Redirect, Tabs } from 'expo-router';

import { BottomNavigation } from '../../src/components/BottomNavigation';
import { QueryState } from '../../src/components/QueryState';
import { useCoreQuery } from '../../src/data/store';
import { getSettings } from '../../src/services/viseCore';
import { color } from '../../src/theme/tokens';

/** Waits for the saved settings; onboarding that never completed sends the user back to it. */
export default function TabsLayout() {
  const settings = useCoreQuery(getSettings);

  return (
    <QueryState query={settings}>
      {(saved) =>
        saved.onboarding_completed ? (
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
        ) : (
          <Redirect href="/onboarding" />
        )
      }
    </QueryState>
  );
}

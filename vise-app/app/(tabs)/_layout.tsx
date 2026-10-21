import { Redirect, Tabs } from 'expo-router';

import { BottomNavigation } from '../../src/components/BottomNavigation';
import { BlurHost, useReduceMotion } from '../../src/components/Glass';
import { QueryState } from '../../src/components/QueryState';
import { useCoreQuery } from '../../src/data/store';
import { getSettings } from '../../src/services/viseCore';
import { color } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

/** Waits for the saved settings; onboarding that never completed sends the user back to it. */
export default function TabsLayout() {
  useTheme();
  const settings = useCoreQuery(getSettings);
  const reduceMotion = useReduceMotion();

  return (
    <QueryState query={settings}>
      {(saved) =>
        saved.onboarding_completed ? (
          <BlurHost>
            <Tabs
              tabBar={(props) => <BottomNavigation {...props} />}
              screenOptions={{
                headerShown: false,
                sceneStyle: { backgroundColor: color.surface.background },
                // Tabs cross-fade instead of cutting.
                animation: reduceMotion ? 'none' : 'fade',
              }}
            >
              <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
              <Tabs.Screen name="transactions" options={{ title: 'Transactions' }} />
              <Tabs.Screen name="budgets" options={{ title: 'Budgets' }} />
              <Tabs.Screen name="reports" options={{ title: 'Reports' }} />
              <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
            </Tabs>
          </BlurHost>
        ) : (
          <Redirect href="/onboarding" />
        )
      }
    </QueryState>
  );
}

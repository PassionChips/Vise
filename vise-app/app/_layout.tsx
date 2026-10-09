import { IBMPlexMono_500Medium, IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { invalidateData } from '../src/data/store';
import { onPaymentCaptured } from '../src/services/capture';

import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';
import { color } from '../src/theme/tokens';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });

  // Render with system fonts if loading fails rather than a blank app.
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ThemeProvider>
      <ThemedStack />
    </ThemeProvider>
  );
}

/** The navigator, status bar and window background follow the current theme. */
function ThemedStack() {
  const { scheme } = useTheme();

  // Payments can be noticed while the app is closed. Coming back to it reloads every screen, so they show up.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') invalidateData();
    });
    // A payment noticed while the app is open shows up in the inbox and on the banner straight away.
    const stopListening = onPaymentCaptured(invalidateData);
    return () => {
      subscription.remove();
      stopListening();
    };
  }, []);

  useEffect(() => {
    // Colours the window behind the screens (visible during transitions and the keyboard).
    SystemUI.setBackgroundColorAsync(color.surface.background).catch(() => {});
  }, [scheme]);

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.surface.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="add-transaction" options={{ presentation: 'modal' }} />
        <Stack.Screen name="budget-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="edit-setting" options={{ presentation: 'modal' }} />
        <Stack.Screen name="import" options={{ presentation: 'modal' }} />
        <Stack.Screen name="backup" options={{ presentation: 'modal' }} />
        <Stack.Screen name="restore" options={{ presentation: 'modal' }} />
        <Stack.Screen name="captured" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}

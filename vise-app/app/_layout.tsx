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
import { Platform } from 'react-native';

import { useReduceMotion } from '../src/components/Glass';
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
  const reduceMotion = useReduceMotion();
  // Forms rise from the bottom on Android; iOS keeps its native sheet.
  const modal = {
    presentation: 'modal',
    animation: reduceMotion ? 'none' : Platform.OS === 'android' ? 'slide_from_bottom' : 'default',
  } as const;

  useEffect(() => {
    // Colours the window behind the screens (visible during transitions and the keyboard).
    SystemUI.setBackgroundColorAsync(color.surface.background).catch(() => {});
  }, [scheme]);

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.surface.background },
          animation: reduceMotion ? 'none' : 'default',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false, animation: reduceMotion ? 'none' : 'fade' }} />
        <Stack.Screen name="add-transaction" options={modal} />
        <Stack.Screen name="budget-form" options={modal} />
        <Stack.Screen name="edit-setting" options={modal} />
        <Stack.Screen name="import" options={modal} />
      </Stack>
    </>
  );
}

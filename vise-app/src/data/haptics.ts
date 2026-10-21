// A light tick when a month or year changes, on phones that have a haptic engine. Never throws and does nothing
// elsewhere (web, simulators), so callers do not need to check the platform.

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export function tick() {
  if (Platform.OS === 'web') return;
  Haptics.selectionAsync().catch(() => {});
}

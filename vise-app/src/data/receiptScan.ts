// "Scan receipt": take or choose a photo, read its text on the device, and turn it into a proposed expense.
// Nothing is saved here; the Add expense form is filled in and the user confirms it.

import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { recognizeLines } from '../services/ocr';
import type { ReceiptScan } from '../services/types';
import { parseReceipt } from '../services/viseCore';

export type ReceiptSource = 'camera' | 'library';

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };

/** Best effort: the picker keeps a copy of the photo in the app's private cache. */
function removePhoto(uri: string) {
  try {
    new File(uri).delete();
  } catch {
    // The OS clears the cache anyway.
  }
}

/** Resolves null if the user cancels. Throws a readable Error if the camera is blocked or the photo cannot be read. */
export async function scanReceipt(
  source: ReceiptSource,
  defaults: { today: string; currency: string },
): Promise<ReceiptScan | null> {
  if (source === 'camera' && Platform.OS !== 'web') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Allow camera access in your phone’s settings to scan receipts, or choose a photo instead.');
    }
  }
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
      : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
  if (result.canceled) return null;

  const uri = result.assets[0].uri;
  try {
    const lines = await recognizeLines(uri);
    return await parseReceipt({ lines, today: defaults.today, default_currency: defaults.currency });
  } finally {
    removePhoto(uri);
  }
}

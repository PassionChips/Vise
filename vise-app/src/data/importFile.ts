// Lets the user choose a CSV file and reads its text.

import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

export interface PickedFile {
  name: string;
  content: string;
}

const MAX_BYTES = 10 * 1024 * 1024;
const TEXT_FILE = /\.(csv|txt|tsv)$/i;

/** Opens the system file picker. Resolves null if the user cancels; throws a readable Error otherwise. */
export async function pickCsvFile(): Promise<PickedFile | null> {
  // Phones often label CSV as text/plain or octet-stream, so any type is allowed and the name is checked.
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];

  if (!TEXT_FILE.test(asset.name)) {
    throw new Error('Choose a .csv file. In Excel or Sheets, use Save as → CSV.');
  }
  if (asset.size != null && asset.size > MAX_BYTES) {
    throw new Error('That file is too large to import (limit 10 MB).');
  }
  try {
    const content = Platform.OS === 'web' && asset.file ? await asset.file.text() : await new File(asset.uri).text();
    return { name: asset.name, content };
  } catch {
    throw new Error('Could not read that file. Try saving it again as a CSV.');
  }
}

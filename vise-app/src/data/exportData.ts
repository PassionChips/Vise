// "Export data (CSV)": rust-core builds the CSV, this file hands it to the user.
//
// On a phone the file goes through the system share sheet, so the user can
// save it to Files / Drive / Downloads or send it somewhere. On the web it
// downloads directly. The temporary copy in the app's private cache is kept
// only until the next export or "Delete all my data", because the app that
// receives it may still be reading it after the share sheet closes.

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { todayIso } from '../format';
import { exportDataCsv } from '../services/viseCore';
import type { CsvExport } from '../services/types';

export const CSV_MIME_TYPE = 'text/csv';

const BOM = String.fromCharCode(0xfeff);

/** Excel only detects UTF-8 (€, £, accented names) when the file starts with a BOM. */
export function withByteOrderMark(csv: string): string {
  return csv.startsWith(BOM) ? csv : BOM + csv;
}

const EXPORT_PREFIX = 'vise-export-';

/** Removes temporary export files left in the private cache. Never throws. */
export function removeExportFiles(): void {
  if (Platform.OS === 'web') return;
  try {
    for (const entry of Paths.cache.list()) {
      if (entry instanceof File && entry.name.startsWith(EXPORT_PREFIX)) entry.delete();
    }
  } catch {
    // Best effort: the cache is private to the app and the OS may clear it anyway.
  }
}

/** Builds the export and lets the user save it. Rejects if any step fails. */
export async function downloadDataCsv(): Promise<CsvExport> {
  const data = await exportDataCsv(todayIso());
  const contents = withByteOrderMark(data.csv);

  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([contents], { type: `${CSV_MIME_TYPE};charset=utf-8` }));
    const link = document.createElement('a');
    link.href = url;
    link.download = data.filename;
    link.click();
    URL.revokeObjectURL(url);
    return data;
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Saving files isn’t available on this device.');
  }
  removeExportFiles();
  const file = new File(Paths.cache, data.filename);
  file.create({ overwrite: true });
  file.write(contents);
  await Sharing.shareAsync(file.uri, {
    mimeType: CSV_MIME_TYPE,
    UTI: 'public.comma-separated-values-text',
    dialogTitle: 'Save your VISE data',
  });
  return data;
}

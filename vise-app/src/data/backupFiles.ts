// Making, saving and picking backup files on the phone.
//
// rust-core writes the backup file (and reads one to restore); this file moves it. A backup is saved to a
// folder the user picked, which lives in shared storage, so it survives deleting the app. After a reinstall
// the app has forgotten the folder, so the user picks the file again from the restore screen.

import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { createBackup, markBackupDone, updateSettings } from '../services/viseCore';
import type { BackupInfo } from '../services/types';
import { BACKUPS_KEPT, backupFileName, folderLabel, isBackupName, staleBackups } from './backupNames';

const MIME_TYPE = 'application/octet-stream';

/** A file:// address as a plain path, which is what rust-core opens. */
export function filePath(uri: string): string {
  const raw = uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** The chosen folder cannot be written to (it was deleted, or the permission was lost). The user must choose it again. */
export class BackupFolderError extends Error {
  constructor() {
    super('VISE can’t save to the backup folder any more. Choose the folder again.');
    this.name = 'BackupFolderError';
  }
}

/** Opens the system folder picker. Resolves null if the user cancels. */
export async function chooseBackupFolder(): Promise<string | null> {
  try {
    const folder = await Directory.pickDirectoryAsync();
    return folder.uri;
  } catch {
    return null;
  }
}

/** Asks rust-core for a backup file in the app's private cache. */
export async function makeBackupFile(passphrase?: string): Promise<{ file: File; info: BackupInfo }> {
  const file = new File(Paths.cache, backupFileName(new Date()));
  const info = await createBackup(filePath(file.uri), passphrase);
  return { file, info };
}

/** Removes the cached copy. Never throws. */
export function discard(file: File) {
  try {
    file.delete();
  } catch {
    // The OS clears the cache anyway.
  }
}

/** Keeps the newest few backups in the folder. Best effort: a failure here never fails the backup. */
function pruneOldBackups(folder: Directory) {
  try {
    const files = folder.list().filter((entry): entry is File => entry instanceof File && isBackupName(entry.name));
    const stale = new Set(staleBackups(files.map((f) => f.name), BACKUPS_KEPT));
    files.filter((f) => stale.has(f.name)).forEach((f) => f.delete());
  } catch {
    // Leave the old ones; they are only clutter.
  }
}

/** Copies the backup into the chosen folder and checks that it arrived intact. */
export async function copyToFolder(file: File, folderUri: string): Promise<void> {
  try {
    const folder = new Directory(folderUri);
    const bytes = await file.bytes();
    const target = folder.createFile(file.name, MIME_TYPE);
    target.write(bytes);
    if ((await target.bytes()).length !== bytes.length) throw new Error('size mismatch');
    pruneOldBackups(folder);
  } catch {
    throw new BackupFolderError();
  }
}

/** The system share sheet, so the user can save the file to Drive, Files, or send it to themselves. */
export async function shareBackup(file: File): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Saving files isn’t available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: MIME_TYPE, UTI: 'public.data', dialogTitle: 'Save your VISE backup' });
}

export interface BackupResult {
  info: BackupInfo;
  folder: string;
}

/**
 * Backs up to the remembered folder, asking for one first if there is none. Records the folder and the time
 * only after the file has arrived. Resolves null if the user cancels the folder picker.
 */
export async function backUpToFolder(options: { folder: string | null; passphrase?: string }): Promise<BackupResult | null> {
  const folder = options.folder ?? (await chooseBackupFolder());
  if (!folder) return null;

  const { file, info } = await makeBackupFile(options.passphrase);
  try {
    await copyToFolder(file, folder);
  } finally {
    discard(file);
  }
  if (folder !== options.folder) await updateSettings({ backup_folder: folder });
  await markBackupDone();
  return { info, folder };
}

export interface PickedBackup {
  name: string;
  /** A path rust-core can open (a private copy of the file). */
  path: string;
  /** Deletes the private copy; call it when done. */
  discard: () => void;
}

/** Opens the system file picker for a backup file. Resolves null if the user cancels. */
export async function pickBackupFile(): Promise<PickedBackup | null> {
  // Phones label unknown file types inconsistently, so any file can be chosen and rust-core checks it.
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  return { name: asset.name, path: filePath(asset.uri), discard: () => discard(new File(asset.uri)) };
}

export { folderLabel };

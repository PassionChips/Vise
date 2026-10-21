// Names and wording for backup files. Pure, so it can be tested without a phone.

export const BACKUP_EXTENSION = '.vise';
/** How many backups are kept in the chosen folder; older ones are removed after a new one is saved. */
export const BACKUPS_KEPT = 3;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** e.g. "vise-backup-2026-10-08-140203.vise" (the phone's local time, so the newest sorts last). */
export function backupFileName(now: Date): string {
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `vise-backup-${day}-${time}${BACKUP_EXTENSION}`;
}

export const isBackupName = (name: string) => /^vise-backup-.+\.vise$/i.test(name);

/** The backups to delete: everything but the newest `keep`. Names that are not backups are never listed. */
export function staleBackups(names: string[], keep = BACKUPS_KEPT): string[] {
  return names
    .filter(isBackupName)
    .sort()
    .reverse()
    .slice(keep);
}

/** A folder address from the file picker, as a person would say it: "Documents/VISE". */
export function folderLabel(uri: string | null): string {
  if (!uri) return '';
  let text = uri;
  try {
    text = decodeURIComponent(uri);
  } catch {
    // Keep the raw address.
  }
  text = text.replace(/\/+$/, '');
  const afterVolume = text.includes(':') ? text.slice(text.lastIndexOf(':') + 1) : text;
  const label = afterVolume.replace(/^\/+/, '');
  // A tree address ends in the folder path; a file address ends in the folder name.
  return text.startsWith('content://') ? label || 'Phone storage' : label.split('/').pop() || label;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "Never", "Today, 14:02", "Yesterday, 09:30" or "5 Oct 2026". */
export function describeLastBackup(unixSeconds: number | null, now: Date): string {
  if (unixSeconds == null) return 'Never';
  const at = new Date(unixSeconds * 1000);
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  if (sameDay(at, now)) return `Today, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(at, yesterday)) return `Yesterday, ${time}`;
  return `${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()}`;
}

/** Whole days since the last backup, or null if there never was one. */
export function daysSinceBackup(unixSeconds: number | null, now: Date): number | null {
  return unixSeconds == null ? null : Math.floor((now.getTime() - unixSeconds * 1000) / 86_400_000);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The lines that describe what a backup contains. */
export function summaryLines(summary: {
  transactions: number;
  categories: number;
  income_sources: number;
  budgets: number;
  first_transaction_date: string | null;
  last_transaction_date: string | null;
}): string[] {
  const lines = [plural(summary.transactions, 'transaction')];
  if (summary.first_transaction_date && summary.last_transaction_date) {
    lines.push(
      summary.first_transaction_date === summary.last_transaction_date
        ? summary.first_transaction_date
        : `${summary.first_transaction_date} to ${summary.last_transaction_date}`,
    );
  }
  lines.push(plural(summary.categories, 'category', 'categories'));
  if (summary.income_sources > 0) lines.push(plural(summary.income_sources, 'income source'));
  if (summary.budgets > 0) lines.push(plural(summary.budgets, 'budget'));
  return lines;
}

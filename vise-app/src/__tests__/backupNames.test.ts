import { describe, expect, it } from 'vitest';

import {
  backupFileName,
  daysSinceBackup,
  describeLastBackup,
  folderLabel,
  isBackupName,
  staleBackups,
  summaryLines,
} from '../data/backupNames';

describe('backup file names', () => {
  it('are dated to the second, so the newest sorts last and none collide', () => {
    expect(backupFileName(new Date(2026, 9, 8, 14, 2, 3))).toBe('vise-backup-2026-10-08-140203.vise');
    expect(backupFileName(new Date(2026, 0, 5, 9, 5, 7))).toBe('vise-backup-2026-01-05-090507.vise');
  });

  it('recognises backups and nothing else', () => {
    expect(isBackupName('vise-backup-2026-10-08-140203.vise')).toBe(true);
    expect(isBackupName('vise-backup-2026-10-08-140203 (1).vise')).toBe(true);
    expect(isBackupName('holiday.jpg')).toBe(false);
    expect(isBackupName('vise-backup.txt')).toBe(false);
  });

  it('keeps the newest three and never touches other files', () => {
    const names = [
      'vise-backup-2026-10-05-100000.vise',
      'notes.txt',
      'vise-backup-2026-10-08-100000.vise',
      'vise-backup-2026-10-06-100000.vise',
      'vise-backup-2026-10-07-100000.vise',
      'vise-backup-2026-10-01-100000.vise',
    ];
    expect(staleBackups(names)).toEqual(['vise-backup-2026-10-05-100000.vise', 'vise-backup-2026-10-01-100000.vise']);
    expect(staleBackups(names.slice(0, 3))).toEqual([]);
    expect(staleBackups(names, 1)).toHaveLength(4);
  });
});

describe('folder labels', () => {
  it('shows an Android folder as its path', () => {
    expect(folderLabel('content://com.android.externalstorage.documents/tree/primary%3ADocuments%2FVISE')).toBe('Documents/VISE');
    expect(folderLabel('content://com.android.externalstorage.documents/tree/primary%3ADocuments%2FVISE/')).toBe('Documents/VISE');
    expect(folderLabel('content://com.android.externalstorage.documents/tree/primary%3A')).toBe('Phone storage');
  });

  it('shows an iPhone folder as its name', () => {
    expect(folderLabel('file:///private/var/mobile/Documents/Backups/')).toBe('Backups');
    expect(folderLabel(null)).toBe('');
  });
});

describe('last backup wording', () => {
  const now = new Date(2026, 9, 8, 15, 0, 0);
  const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m, d, h, min).getTime() / 1000;

  it('speaks in days when it can', () => {
    expect(describeLastBackup(null, now)).toBe('Never');
    expect(describeLastBackup(at(2026, 9, 8, 14, 2), now)).toBe('Today, 14:02');
    expect(describeLastBackup(at(2026, 9, 7, 9, 30), now)).toBe('Yesterday, 09:30');
    expect(describeLastBackup(at(2026, 8, 20, 9, 30), now)).toBe('20 Sep 2026');
  });

  it('counts whole days, or null if never', () => {
    expect(daysSinceBackup(null, now)).toBeNull();
    expect(daysSinceBackup(at(2026, 9, 8, 14, 0), now)).toBe(0);
    expect(daysSinceBackup(at(2026, 8, 28, 15, 0), now)).toBe(10);
  });
});

describe('what a backup contains', () => {
  it('lists only what is there', () => {
    expect(
      summaryLines({
        transactions: 312,
        categories: 8,
        income_sources: 1,
        budgets: 14,
        first_transaction_date: '2025-01-03',
        last_transaction_date: '2026-10-05',
      }),
    ).toEqual(['312 transactions', '2025-01-03 to 2026-10-05', '8 categories', '1 income source', '14 budgets']);
    expect(
      summaryLines({
        transactions: 1,
        categories: 1,
        income_sources: 0,
        budgets: 0,
        first_transaction_date: '2026-10-05',
        last_transaction_date: '2026-10-05',
      }),
    ).toEqual(['1 transaction', '2026-10-05', '1 category']);
    expect(
      summaryLines({ transactions: 0, categories: 0, income_sources: 0, budgets: 0, first_transaction_date: null, last_transaction_date: null }),
    ).toEqual(['0 transactions', '0 categories']);
  });
});

import { passphraseProblem } from '../data/passphrase';

describe('backup passphrase', () => {
  it('needs 8 characters and a matching confirmation', () => {
    expect(passphraseProblem('short', 'short')).toMatch(/at least 8/);
    expect(passphraseProblem('long enough', 'long enogh')).toMatch(/don’t match/);
    expect(passphraseProblem('long enough', 'long enough')).toBeNull();
  });

  it('counts characters the way rust-core does, not UTF-16 units', () => {
    expect(passphraseProblem('😀😀😀😀😀😀😀', '😀😀😀😀😀😀😀')).toMatch(/at least 8/);
    expect(passphraseProblem('😀😀😀😀😀😀😀😀', '😀😀😀😀😀😀😀😀')).toBeNull();
  });
});

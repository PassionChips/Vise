import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ module: null as null | { call: (m: string, p: string) => Promise<string> } }));

vi.mock('expo', () => ({ requireOptionalNativeModule: () => native.module }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: vi.fn(), shareAsync: vi.fn() }));
vi.mock('expo-file-system', () => ({ File: class {}, Paths: { cache: { list: () => [] } } }));

import { describeErasure } from '../data/erasure';
import { withByteOrderMark } from '../data/exportData';
import { subscribeToInvalidation } from '../data/store';
import {
  deleteAllData,
  exportDataCsv,
  getDataOverview,
  updateSettings,
} from '../services/viseCore';

const reply = (value: object) => JSON.stringify(value);

describe('bridge calls for appearance, avatar, export and delete', () => {
  let invalidations = 0;
  let unsubscribe = () => {};
  beforeEach(() => {
    invalidations = 0;
    unsubscribe = subscribeToInvalidation(() => {
      invalidations += 1;
    });
  });
  afterEach(() => unsubscribe());

  function answer(data: unknown) {
    const call = vi.fn().mockResolvedValue(reply({ ok: true, data }));
    native.module = { call };
    return call;
  }

  it('saves the theme through updateSettings and reloads screens', async () => {
    const call = answer({ theme: 'dark' });
    await updateSettings({ theme: 'dark' });
    expect(call).toHaveBeenCalledWith('updateSettings', '{"theme":"dark"}');
    expect(invalidations).toBe(1);
  });

  it('saves the avatar (or initials) through updateSettings and reloads screens', async () => {
    const call = answer({ avatar: 'cat' });
    await updateSettings({ avatar: 'cat' });
    await updateSettings({ avatar: '' });
    expect(call.mock.calls.map(([method, payload]) => [method, payload])).toEqual([
      ['updateSettings', '{"avatar":"cat"}'],
      ['updateSettings', '{"avatar":""}'],
    ]);
    expect(invalidations).toBe(2);
  });

  it('export is a read: it names the file by date and does not reload screens', async () => {
    const call = answer({ filename: 'vise-export-2026-10-04.csv', csv: 'record\n', transaction_count: 0, budget_count: 0 });
    await exportDataCsv('2026-10-04');
    expect(call).toHaveBeenCalledWith('exportDataCsv', '{"today":"2026-10-04"}');
    expect(invalidations).toBe(0);
  });

  it('delete always sends the confirmation word and reloads every screen', async () => {
    const call = answer({ transactions: 3, categories: 1, income_sources: 1, budgets: 2 });
    await getDataOverview();
    await deleteAllData();
    expect(call).toHaveBeenLastCalledWith('deleteAllData', '{"confirm":"DELETE"}');
    expect(invalidations).toBe(1);
  });

  it('an out-of-date Rust core gets a clear message instead of "Unknown method"', async () => {
    native.module = {
      call: vi.fn().mockResolvedValue(reply({ ok: false, error: { kind: 'invalid_request', message: "Unknown method 'exportDataCsv'" } })),
    };
    await expect(exportDataCsv('2026-10-04')).rejects.toMatchObject({
      kind: 'invalid_request',
      message: expect.stringContaining('needs a newer VISE core'),
    });
  });

  it('a failed delete rejects and does not reload, so nothing looks erased', async () => {
    native.module = {
      call: vi.fn().mockResolvedValue(reply({ ok: false, error: { kind: 'database', message: 'Something went wrong' } })),
    };
    await expect(deleteAllData()).rejects.toMatchObject({ kind: 'database' });
    expect(invalidations).toBe(0);
  });
});

describe('delete warning wording', () => {
  it('lists every kind of data with correct plurals', () => {
    const text = describeErasure({ transactions: 1, budgets: 2, categories: 1, income_sources: 3 });
    expect(text).toContain('1 transaction,');
    expect(text).toContain('2 budgets');
    expect(text).toContain('1 category,');
    expect(text).toContain('3 income sources');
    expect(text).toContain('avatar');
    expect(text).toMatch(/can’t be undone/);
  });

  it('uses plurals for zero', () => {
    const text = describeErasure({ transactions: 0, budgets: 0, categories: 2, income_sources: 0 });
    expect(text).toContain('0 transactions');
    expect(text).toContain('2 categories');
  });
});

describe('file helpers', () => {
  it('adds a single UTF-8 byte-order mark so Excel shows €, £ and accents', () => {
    const once = withByteOrderMark('a,b\n€1,£2\n');
    expect(once.charCodeAt(0)).toBe(0xfeff);
    expect(withByteOrderMark(once)).toBe(once);
  });

});

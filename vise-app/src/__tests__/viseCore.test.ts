import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ module: null as null | { call: (m: string, p: string) => Promise<string> } }));

vi.mock('expo', () => ({ requireOptionalNativeModule: () => native.module }));

import { subscribeToInvalidation } from '../data/store';
import { addTransaction, commitImport, getSettings, previewImport, ViseError } from '../services/viseCore';

const reply = (value: object) => JSON.stringify(value);

describe('viseCore bridge client', () => {
  let invalidations = 0;
  let unsubscribe = () => {};
  beforeEach(() => {
    invalidations = 0;
    unsubscribe = subscribeToInvalidation(() => {
      invalidations += 1;
    });
  });
  afterEach(() => unsubscribe());

  it('sends the method and JSON payload to the native module and unwraps data', async () => {
    const call = vi.fn().mockResolvedValue(reply({ ok: true, data: { currency: 'EUR' } }));
    native.module = { call };

    const settings = await getSettings();

    expect(call).toHaveBeenCalledWith('getSettings', '{}');
    expect(settings).toEqual({ currency: 'EUR' });
  });

  it('reads do not invalidate; successful writes do, so screens reload', async () => {
    native.module = { call: vi.fn().mockResolvedValue(reply({ ok: true, data: {} })) };

    await getSettings();
    expect(invalidations).toBe(0);

    await addTransaction({ transaction_type: 'expense', amount: '1', currency: 'EUR', description: 'x', date: '2026-09-01' });
    expect(invalidations).toBe(1);
  });

  it('a rejected write throws a ViseError carrying the field and does NOT invalidate', async () => {
    native.module = {
      call: vi.fn().mockResolvedValue(reply({ ok: false, error: { kind: 'validation', field: 'amount', message: 'Enter an amount' } })),
    };

    const failure = addTransaction({ transaction_type: 'expense', amount: '', currency: 'EUR', description: 'x', date: '2026-09-01' });

    await expect(failure).rejects.toBeInstanceOf(ViseError);
    await expect(failure).rejects.toMatchObject({ kind: 'validation', field: 'amount' });
    expect(invalidations).toBe(0);
  });

  it('without the native module every call fails; nothing pretends to succeed', async () => {
    native.module = null;

    await expect(getSettings()).rejects.toMatchObject({ kind: 'bridge_unavailable' });
    await expect(
      addTransaction({ transaction_type: 'expense', amount: '1', currency: 'EUR', description: 'x', date: '2026-09-01' }),
    ).rejects.toMatchObject({ kind: 'bridge_unavailable' });
    expect(invalidations).toBe(0);
  });

  it('previewImport sends the file and options and does not invalidate; commitImport does', async () => {
    const call = vi.fn().mockResolvedValue(reply({ ok: true, data: {} }));
    native.module = { call };
    const input = { content: 'Date,Amount\n2026-09-01,-1', today: '2026-10-07', default_currency: 'EUR', date_order: 'dmy' as const };

    await previewImport(input);
    expect(call).toHaveBeenCalledWith('previewImport', JSON.stringify(input));
    expect(invalidations).toBe(0);

    await commitImport(input);
    expect(call).toHaveBeenLastCalledWith('commitImport', JSON.stringify(input));
    expect(invalidations).toBe(1);
  });
});

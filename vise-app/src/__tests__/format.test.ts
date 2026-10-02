import { afterEach, describe, expect, it, vi } from 'vitest';

import { centsToAmount, daysLeftInMonth, formatMoney, isoFromUnix, monthLabel, shiftMonth } from '../format';

describe('format helpers', () => {
  afterEach(() => vi.useRealTimers());

  it('formats money in the stored currency', () => {
    expect(formatMoney(425_000, { currency: 'GBP' })).toBe('£4,250.00');
    expect(formatMoney(-4_280, { currency: 'USD' })).toBe('−$42.80');
    expect(formatMoney(5, { currency: 'CHF' })).toBe('CHF 0.05');
  });

  it('turns cents back into the string rust-core parses', () => {
    expect(centsToAmount(1250)).toBe('12.50');
    expect(centsToAmount(5)).toBe('0.05');
    expect(centsToAmount(100_000)).toBe('1000.00');
  });

  it('moves between months across year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-09', -5)).toBe('2026-04');
  });

  it('labels months and converts stored timestamps to dates', () => {
    expect(monthLabel('2026-09')).toBe('September 2026');
    expect(isoFromUnix(Date.UTC(2026, 8, 18) / 1000)).toBe('2026-09-18');
  });

  it('counts days left only for the current month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 18, 12));
    expect(daysLeftInMonth('2026-09')).toBe(12);
    expect(daysLeftInMonth('2026-08')).toBe(0);
  });
});

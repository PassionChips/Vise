import { describe, expect, it } from 'vitest';

import {
  addDays,
  compactMoney,
  dailyAllowance,
  dayLabel,
  dayLevel,
  dayTotals,
  dayAtOffset,
  daysInMonth,
  isRealDate,
  monthAt,
  monthGrid,
  monthIndex,
  MONTH_COUNT,
  neighbourMonths,
  periodTotals,
  shiftYear,
  weekdayLabels,
  wheelIndex,
  withMonth,
  withYear,
} from '../data/calendar';
import type { Transaction } from '../services/types';

const at = (date: string) => Date.parse(`${date}T00:00:00Z`) / 1000;

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 1,
  source_type: 'manual',
  transaction_type: 'expense',
  amount_cents: 1000,
  currency: 'EUR',
  description: 'x',
  occurred_at: at('2026-10-08'),
  income_source_id: null,
  expense_category_id: null,
  external_id: null,
  revolut_account_id: null,
  merchant_name: null,
  raw_description: null,
  revolut_category: null,
  status: 'completed',
  completed_at: null,
  exclude_from_totals: false,
  created_at: 0,
  updated_at: 0,
  ...over,
});

describe('month grid', () => {
  it('knows month lengths, including leap years', () => {
    expect(daysInMonth('2026-10')).toBe(31);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2100-02')).toBe(28);
  });

  it('starts the week on Monday and pads with nulls', () => {
    // 1 October 2026 is a Thursday.
    const grid = monthGrid('2026-10');
    expect(grid[0].map((c) => c?.day ?? null)).toEqual([null, null, null, 1, 2, 3, 4]);
    expect(grid.every((row) => row.length === 7)).toBe(true);
    const flat = grid.flat().filter(Boolean);
    expect(flat).toHaveLength(31);
    expect(flat[0]?.date).toBe('2026-10-01');
    expect(flat[30]?.date).toBe('2026-10-31');
    expect(weekdayLabels()[0]).toBe('Mon');
  });

  it('can start on Sunday', () => {
    expect(monthGrid('2026-10', 0)[0].map((c) => c?.day ?? null)).toEqual([null, null, null, null, 1, 2, 3]);
    expect(weekdayLabels(0)[0]).toBe('Sun');
  });

  it('a month that fills exactly four weeks has no padding rows', () => {
    // February 2027 starts on a Monday and has 28 days.
    const grid = monthGrid('2027-02');
    expect(grid).toHaveLength(4);
    expect(grid.flat().every(Boolean)).toBe(true);
  });

  it('a month can need six rows', () => {
    // 1 March 2026 is a Sunday: with Monday starts the 31 days spill into a sixth row.
    expect(monthGrid('2026-03')).toHaveLength(6);
  });

  it('moves years and months without touching the other part', () => {
    expect(shiftYear('2026-10', -3)).toBe('2023-10');
    expect(withYear('2026-10', 2019)).toBe('2019-10');
    expect(withMonth('2026-10', 3)).toBe('2026-03');
  });
});

describe('period totals follow rust-core', () => {
  it('adds income, adds expenses, subtracts refunds, ignores transfers', () => {
    const totals = periodTotals(
      [
        tx({ transaction_type: 'income', amount_cents: 320_000 }),
        tx({ transaction_type: 'expense', amount_cents: 5_000 }),
        tx({ transaction_type: 'expense', amount_cents: 2_500 }),
        tx({ transaction_type: 'refund', amount_cents: 1_000 }),
        tx({ transaction_type: 'transfer', amount_cents: 99_999 }),
      ],
      'EUR',
    );
    expect(totals).toEqual({ income: 320_000, spent: 6_500, net: 313_500, count: 5 });
  });

  it('skips other currencies, excluded, failed and reverted rows, but counts pending', () => {
    const totals = periodTotals(
      [
        tx({ amount_cents: 100 }),
        tx({ amount_cents: 200, currency: 'USD' }),
        tx({ amount_cents: 400, exclude_from_totals: true }),
        tx({ amount_cents: 800, status: 'failed' }),
        tx({ amount_cents: 1600, status: 'reverted' }),
        tx({ amount_cents: 3200, status: 'pending' }),
      ],
      'EUR',
    );
    expect(totals.spent).toBe(3300);
  });

  it('is empty for no transactions', () => {
    expect(periodTotals([], 'EUR')).toEqual({ income: 0, spent: 0, net: 0, count: 0 });
  });
});

describe('daily totals use the date the transaction happened', () => {
  it('groups by the stored date, not by when it was entered', () => {
    const days = dayTotals(
      [
        tx({ occurred_at: at('2026-03-12'), amount_cents: 5000, created_at: at('2026-10-08') }),
        tx({ occurred_at: at('2026-03-12'), amount_cents: 1500 }),
        tx({ occurred_at: at('2026-03-13'), transaction_type: 'income', amount_cents: 9000 }),
      ],
      'EUR',
    );
    expect(Object.keys(days).sort()).toEqual(['2026-03-12', '2026-03-13']);
    expect(days['2026-03-12']).toMatchObject({ spent: 6500, income: 0, count: 2 });
    expect(days['2026-03-13']).toMatchObject({ spent: 0, income: 9000 });
  });
});

describe('spending levels', () => {
  it('no spending is none', () => {
    expect(dayLevel(0, 1000, 5000)).toBe('none');
    expect(dayLevel(-500, null, 5000)).toBe('none');
  });

  it('against a daily allowance: within is healthy, a bit over is mid, well over is high', () => {
    expect(dayLevel(1000, 1000, 5000)).toBe('under');
    expect(dayLevel(1500, 1000, 5000)).toBe('mid');
    expect(dayLevel(1501, 1000, 5000)).toBe('high');
  });

  it('without a limit, relative to the month’s biggest day', () => {
    expect(dayLevel(1000, null, 9000)).toBe('low');
    expect(dayLevel(4000, null, 9000)).toBe('mid');
    expect(dayLevel(9000, null, 9000)).toBe('high');
  });

  it('spreads a monthly limit over the days', () => {
    expect(dailyAllowance(31_000, '2026-10')).toBe(1000);
    expect(dailyAllowance(null, '2026-10')).toBeNull();
    expect(dailyAllowance(0, '2026-10')).toBeNull();
  });
});

describe('labels', () => {
  it('shortens amounts to fit a calendar cell', () => {
    expect(compactMoney(2400, '€')).toBe('€24');
    expect(compactMoney(2450, '€')).toBe('€25');
    expect(compactMoney(99_900, '€')).toBe('€999');
    expect(compactMoney(123_400, '€')).toBe('€1.2k');
    expect(compactMoney(200_000, '€')).toBe('€2k');
    expect(compactMoney(1_250_000, '€')).toBe('€13k');
    expect(compactMoney(-2400, '$')).toBe('$24');
  });

  it('names a day', () => {
    expect(dayLabel('2020-09-25')).toBe('Fri 25 Sep 2020');
  });
});

describe('date arithmetic', () => {
  it('moves across month and year ends', () => {
    expect(addDays('2026-10-08', -1)).toBe('2026-10-07');
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-10-08', -7)).toBe('2026-10-01');
  });

  it('accepts only real dates', () => {
    expect(isRealDate('2026-10-08')).toBe(true);
    expect(isRealDate('2028-02-29')).toBe(true);
    for (const bad of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-1-1', 'today', '', undefined, null]) {
      expect(isRealDate(bad as string | undefined), String(bad)).toBe(false);
    }
  });
});

describe('the swipeable month range', () => {
  it('maps months to positions and back', () => {
    expect(monthIndex('1990-01')).toBe(0);
    expect(monthIndex('1990-12')).toBe(11);
    expect(monthIndex('1991-01')).toBe(12);
    expect(monthAt(0)).toBe('1990-01');
    expect(monthAt(MONTH_COUNT - 1)).toBe('2100-12');
    for (const month of ['1999-07', '2026-10', '2100-12', '1990-01']) expect(monthAt(monthIndex(month))).toBe(month);
  });

  it('adjacent positions are adjacent months, across year ends', () => {
    expect(monthAt(monthIndex('2026-12') + 1)).toBe('2027-01');
    expect(monthAt(monthIndex('2026-01') - 1)).toBe('2025-12');
  });

  it('never leaves the range', () => {
    expect(monthIndex('1980-05')).toBe(0);
    expect(monthIndex('2200-05')).toBe(MONTH_COUNT - 1);
    expect(monthAt(-5)).toBe('1990-01');
    expect(monthAt(99_999)).toBe('2100-12');
  });

  it('knows which neighbours to preload', () => {
    expect(neighbourMonths('2026-10')).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(neighbourMonths('1990-01')).toEqual(['1990-01', '1990-02']);
    expect(neighbourMonths('2100-12')).toEqual(['2100-11', '2100-12']);
  });
});

describe('wheel position', () => {
  it('picks the row under the band and clamps at both ends', () => {
    expect(wheelIndex(0, 44, 12)).toBe(0);
    expect(wheelIndex(43, 44, 12)).toBe(1);
    expect(wheelIndex(21, 44, 12)).toBe(0);
    expect(wheelIndex(22, 44, 12)).toBe(1);
    expect(wheelIndex(-80, 44, 12)).toBe(0);
    expect(wheelIndex(9999, 44, 12)).toBe(11);
  });
});

describe('which day is under the header', () => {
  const days = [
    { date: '2026-10-08', offset: 100 },
    { date: '2026-10-07', offset: 400 },
    { date: '2026-10-05', offset: 900 },
  ];

  it('is the last day group that has started', () => {
    expect(dayAtOffset(days, 50)).toBeNull();
    expect(dayAtOffset(days, 100)).toBe('2026-10-08');
    expect(dayAtOffset(days, 399)).toBe('2026-10-08');
    expect(dayAtOffset(days, 400)).toBe('2026-10-07');
    expect(dayAtOffset(days, 5000)).toBe('2026-10-05');
  });

  it('stops at a day whose position is not known yet', () => {
    expect(dayAtOffset([{ date: 'a', offset: 10 }, { date: 'b', offset: undefined }, { date: 'c', offset: 20 }], 99)).toBe('a');
    expect(dayAtOffset([], 10)).toBeNull();
  });
});

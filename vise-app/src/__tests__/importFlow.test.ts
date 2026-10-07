import { describe, expect, it } from 'vitest';

import { applyValue, choiceValue } from '../data/importCategories';
import {
  buildInput,
  columnOptions,
  columnValue,
  dateNote,
  emptyOptions,
  keyForLabel,
  DATE_ORDER_LABELS,
  setColumn,
  summaryLines,
} from '../data/importFlow';
import type { ImportSampleRow, ImportSummary } from '../services/types';

const defaults = { today: '2026-10-07', currency: 'EUR' };

describe('import request', () => {
  it('sends only what the user changed', () => {
    expect(buildInput('x', emptyOptions, defaults)).toEqual({ content: 'x', today: '2026-10-07', default_currency: 'EUR' });

    const input = buildInput(
      'x',
      { mapping: { amount: 2 }, none: ['category'], dateOrder: 'mdy', decimalSeparator: 'comma', positiveIs: 'income' },
      defaults,
    );
    expect(input).toMatchObject({
      mapping: { amount: 2 },
      no_columns: ['category'],
      date_order: 'mdy',
      decimal_separator: 'comma',
      positive_is: 'income',
    });
  });
});

describe('column choices', () => {
  it('picking a column records it; picking "not in the file" switches the field off; picking again undoes that', () => {
    let options = setColumn(emptyOptions, 'category', '3');
    expect(options).toEqual({ mapping: { category: 3 }, none: [] });
    options = setColumn(options, 'category', 'none');
    expect(options).toEqual({ mapping: {}, none: ['category'] });
    options = setColumn(options, 'category', '1');
    expect(options).toEqual({ mapping: { category: 1 }, none: [] });
  });

  it('lists every column with an example, and "not in the file" first', () => {
    const options = columnOptions([
      { index: 0, name: 'Date', example: '2026-09-01' },
      { index: 1, name: '', example: '' },
      { index: 2, name: 'Details', example: 'A very long description that keeps going' },
    ]);
    expect(options.map((o) => o.value)).toEqual(['none', '0', '1', '2']);
    expect(options[1].label).toBe('Date (2026-09-01)');
    expect(options[2].label).toBe('Column 2');
    expect(options[3].label.length).toBeLessThan(45);
    expect(columnValue(null)).toBe('none');
    expect(columnValue(0)).toBe('0');
  });

  it('finds the key behind a segmented-control label', () => {
    expect(keyForLabel(DATE_ORDER_LABELS, 'Month first')).toBe('mdy');
  });
});

describe('category picker values', () => {
  it('round-trips existing, new and none', () => {
    let choices = applyValue([], 'm:lidl', '7');
    expect(choices).toEqual([{ group: 'm:lidl', category_id: 7 }]);
    expect(choiceValue(choices, 'm:lidl')).toBe('7');

    choices = applyValue(choices, 'm:lidl', 'new:Fuel');
    expect(choices).toEqual([{ group: 'm:lidl', new_category: 'Fuel' }]);
    expect(choiceValue(choices, 'm:lidl')).toBe('new:Fuel');

    choices = applyValue(choices, 'm:lidl', 'none');
    expect(choices).toEqual([]);
    expect(choiceValue(choices, 'm:lidl')).toBe('none');
  });
});

describe('wording', () => {
  const row = (date_source: ImportSampleRow['date_source']): ImportSampleRow => ({
    row: 2,
    date: '2026-09-01',
    date_source,
    description: 'x',
    amount_cents: 1,
    currency: 'EUR',
    transaction_type: 'expense',
    duplicate: false,
  });

  it('explains where a guessed date came from', () => {
    expect(dateNote(row('file'))).toBeNull();
    expect(dateNote(row('above'))).toMatch(/above/);
    expect(dateNote(row('below'))).toMatch(/below/);
    expect(dateNote(row('import_day'))).toMatch(/today/);
  });

  it('summarizes an import, mentioning only what happened', () => {
    const summary: ImportSummary = {
      inserted: 1,
      duplicates: 0,
      skipped: 0,
      error_count: 0,
      errors: [],
      filled_dates: 0,
      categorized: 0,
      categories_created: 0,
    };
    expect(summaryLines(summary)).toEqual(['1 transaction imported']);
    expect(
      summaryLines({ ...summary, inserted: 28, categorized: 20, categories_created: 2, duplicates: 3, filled_dates: 4, error_count: 1 }),
    ).toEqual([
      '28 transactions imported',
      '20 categorized',
      '2 new categories created',
      '3 duplicates skipped',
      '4 dates filled in from nearby rows',
      '1 row could not be read',
    ]);
  });
});

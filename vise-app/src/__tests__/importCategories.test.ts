import { describe, expect, it } from 'vitest';

import { categorizedRowCount, suggestedChoices, withChoice } from '../data/importCategories';
import type { ImportGroup } from '../services/types';

const group = (key: string, rows: number, suggestion: ImportGroup['suggestion']): ImportGroup => ({
  key,
  kind: key.startsWith('cat:') ? 'file_category' : 'merchant',
  label: key,
  rows,
  total_cents: rows * 100,
  suggestion,
});

const groups = [
  group('m:lidl', 14, { category_id: 3, name: 'Groceries', source: 'history', is_new: false }),
  group('cat:fun', 2, { category_id: null, name: 'Fun', source: 'file', is_new: true }),
  group('m:shell', 6, null),
];

describe('import category choices', () => {
  it('accepts every suggestion: existing categories by id, new ones by name, none for the rest', () => {
    expect(suggestedChoices(groups)).toEqual([
      { group: 'm:lidl', category_id: 3 },
      { group: 'cat:fun', new_category: 'Fun' },
    ]);
  });

  it('changing one group replaces its choice and keeps the others', () => {
    const choices = withChoice(suggestedChoices(groups), { group: 'm:lidl', category_id: 7 });
    expect(choices).toContainEqual({ group: 'm:lidl', category_id: 7 });
    expect(choices.filter((c) => c.group === 'm:lidl')).toHaveLength(1);
    expect(choices).toContainEqual({ group: 'cat:fun', new_category: 'Fun' });
  });

  it('counts the rows the choices will categorize', () => {
    expect(categorizedRowCount(groups, suggestedChoices(groups))).toBe(16);
    expect(categorizedRowCount(groups, [])).toBe(0);
    expect(categorizedRowCount(groups, [{ group: 'm:shell' }])).toBe(0);
  });
});

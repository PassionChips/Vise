import { describe, expect, it } from 'vitest';

import { activeErrors, clearError, fixSummary } from '../data/formErrors';

describe('form errors', () => {
  it('counts only fields that still have a message', () => {
    expect(activeErrors({ amount: 'Enter an amount', category: undefined, description: '' })).toEqual(['amount']);
    expect(activeErrors({})).toEqual([]);
  });

  it('does not count the whole-form error as a field', () => {
    expect(activeErrors({ form: 'Could not save', amount: 'Enter an amount' })).toEqual(['amount']);
  });

  it('a fixed field leaves no trace, so the banner can go away', () => {
    const errors = { amount: 'Enter an amount', category: 'Choose a category' };
    const after = clearError(errors, 'amount');
    expect(Object.keys(after)).toEqual(['category']);
    expect(activeErrors(clearError(after, 'category'))).toEqual([]);
    expect(Object.keys(errors)).toEqual(['amount', 'category']); // the original is untouched
  });

  it('the banner names the fields', () => {
    expect(fixSummary(['Amount'])).toEqual({ title: '1 thing needs fixing', description: 'Check Amount below.' });
    expect(fixSummary(['Amount', 'Category'])).toEqual({
      title: '2 things need fixing',
      description: 'Check Amount and Category below.',
    });
    expect(fixSummary(['Amount', 'Description', 'Source']).description).toBe('Check Amount, Description and Source below.');
  });
});

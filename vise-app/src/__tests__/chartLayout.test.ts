import { describe, expect, it } from 'vitest';

import { isLabelShown, labelStride, MIN_LABEL_WIDTH } from '../data/chartLayout';

const shown = (count: number, width: number) => {
  const stride = labelStride(width, count);
  return Array.from({ length: count }, (_, i) => isLabelShown(i, count, stride));
};

describe('chart labels on a phone-width card (~310px)', () => {
  it('shows every label for 3M and 6M', () => {
    expect(shown(4, 310).every(Boolean)).toBe(true);
    expect(shown(7, 310).every(Boolean)).toBe(true);
  });

  it('thins out 12M + estimate (13 columns) so no two labels overlap', () => {
    const labels = shown(13, 310);
    expect(labels.filter(Boolean).length).toBeLessThan(13);
    // Visible labels are at least MIN_LABEL_WIDTH apart.
    const step = labelStride(310, 13) * (310 / 13);
    expect(step).toBeGreaterThanOrEqual(MIN_LABEL_WIDTH);
  });

  it('always shows the newest (last) column', () => {
    for (const count of [3, 6, 12, 13, 24]) {
      expect(shown(count, 310).at(-1)).toBe(true);
    }
  });

  it('shows everything before the plot has been measured', () => {
    expect(labelStride(0, 13)).toBe(1);
    expect(labelStride(310, 0)).toBe(1);
  });
});

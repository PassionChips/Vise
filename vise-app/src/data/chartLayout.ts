// Layout rules for the bar charts. Pure, so they can be unit-tested.
//
// With 12 months (plus an estimate) on a phone, each column is only ~24px
// wide, too narrow for "Sep"-style labels. Rather than letting them
// overlap, show every 2nd or 3rd label, always keeping the newest one.

/** Width a short month label ("Sep", "Est.") needs, including breathing room. */
export const MIN_LABEL_WIDTH = 30;

/** Show every `stride`-th label so labels never overlap. 1 = show all. */
export function labelStride(plotWidth: number, count: number, minLabelWidth = MIN_LABEL_WIDTH): number {
  if (plotWidth <= 0 || count <= 0) return 1;
  return Math.max(1, Math.ceil(minLabelWidth / (plotWidth / count)));
}

/** Labels are counted back from the last (newest) column, so it is always shown. */
export function isLabelShown(index: number, count: number, stride: number): boolean {
  return (count - 1 - index) % stride === 0;
}

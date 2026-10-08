// Helpers for form validation messages.
//
// Form errors are kept as `{ amount: "Enter an amount", ... }`. A field that is fixed must be
// removed from that object, not set to `undefined`: a key left behind with no message still
// counts as an error and keeps the "N things need fixing" banner on screen.

type Errors = Partial<Record<string, string | undefined>>;

/** The fields that currently have a message. `form` (an error about the whole save) is not a field. */
export function activeErrors(errors: Errors): string[] {
  return Object.entries(errors)
    .filter(([key, message]) => key !== 'form' && Boolean(message))
    .map(([key]) => key);
}

/** A copy of `errors` without `key`. */
export function clearError<E extends object>(errors: E, key: keyof E): E {
  const next = { ...errors };
  delete next[key];
  return next;
}

const sentence = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** The banner text, naming the fields: "2 things need fixing" / "Check Amount and Category below." */
export function fixSummary(labels: string[]): { title: string; description: string } {
  const count = labels.length;
  return {
    title: `${count} ${count === 1 ? 'thing needs' : 'things need'} fixing`,
    description: count === 0 ? '' : `Check ${sentence(labels)} below.`,
  };
}

// Checks for the optional backup passphrase. The same rule as rust-core (8 or more characters).

export const MIN_PASSPHRASE = 8;

const length = (text: string) => Array.from(text).length;

/** Why this passphrase cannot be used, or null if it is fine. */
export function passphraseProblem(passphrase: string, confirmation: string): string | null {
  if (length(passphrase) < MIN_PASSPHRASE) return `Use at least ${MIN_PASSPHRASE} characters`;
  if (passphrase !== confirmation) return 'The two passphrases don’t match';
  return null;
}

// The date of the transaction that was just saved, so the Transactions tab can say where it went.
//
// A transaction is stored under the date the user chose, which is often not today. Saving closes the form and
// leaves the user on a screen showing another month, so without this the new entry looks like it vanished.
// Nothing here is a source of truth: the transaction itself lives in rust-core.

import { useSyncExternalStore } from 'react';

let current: string | null = null;
const listeners = new Set<() => void>();

/** Remember the date (YYYY-MM-DD) of a transaction that was just saved, or clear it with null. */
export function setSavedTransactionDate(date: string | null) {
  current = date;
  listeners.forEach((listener) => listener());
}

export function useSavedTransactionDate(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => current,
  );
}

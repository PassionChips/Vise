// The most recently deleted category budget, so the Budgets tab can offer "Undo"
// after the edit screen (which does the deleting) has closed. Undo writes the budget
// back through rust-core; nothing here is a source of truth for budgets.

import { useSyncExternalStore } from 'react';

export interface DeletedBudget {
  month: string;
  currency: string;
  categoryId: number;
  name: string;
  limitCents: number;
}

let current: DeletedBudget | null = null;
const listeners = new Set<() => void>();

export function setDeletedBudget(value: DeletedBudget | null) {
  current = value;
  listeners.forEach((l) => l());
}

export function useDeletedBudget(): DeletedBudget | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => current,
  );
}

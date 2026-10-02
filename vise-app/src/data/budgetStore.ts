// In-memory category budgets shared by the Budgets tab, the Dashboard and the
// add/edit budget screen. Replace with viseCore calls once the native bridge exists.

import { useSyncExternalStore } from "react";

import {
  categoryBreakdown,
  categoryBudgets,
  type DemoCategoryStatus,
} from "./demo";

/** Every expense category a budget can be set on. */
export const ALL_CATEGORIES: {
  id: number;
  name: string;
  icon: DemoCategoryStatus["icon"];
}[] = [
  { id: 1, name: "Shopping", icon: "shopping-bag" },
  { id: 2, name: "Food & Dining", icon: "utensils" },
  { id: 3, name: "Bills", icon: "zap" },
  { id: 4, name: "Groceries", icon: "shopping-cart" },
  { id: 5, name: "Transport", icon: "bus" },
  { id: 6, name: "Entertainment", icon: "film" },
  { id: 7, name: "Housing", icon: "house" },
  { id: 8, name: "Subscriptions", icon: "repeat" },
  { id: 9, name: "Health", icon: "heart-pulse" },
  { id: 10, name: "Travel", icon: "plane" },
  { id: 11, name: "Education", icon: "graduation-cap" },
];

export interface DeletedBudget {
  item: DemoCategoryStatus;
  index: number;
}

interface State {
  budgets: DemoCategoryStatus[];
  lastDeleted: DeletedBudget | null;
}

let state: State = { budgets: categoryBudgets, lastDeleted: null };
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

function withLimit(
  item: DemoCategoryStatus,
  limit_cents: number,
): DemoCategoryStatus {
  const remaining_cents = limit_cents - item.spent_cents;
  return {
    ...item,
    limit_cents,
    remaining_cents,
    status: remaining_cents < 0 ? "over_limit" : "within_limit",
  };
}

export function useBudgets(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export function getBudget(categoryId: number) {
  return state.budgets.find((b) => b.category_id === categoryId);
}

/** Creates a budget, or changes the limit if the category already has one. */
export function saveBudget(categoryId: number, limitCents: number) {
  const existing = getBudget(categoryId);
  if (existing) {
    set({
      ...state,
      budgets: state.budgets.map((b) =>
        b === existing ? withLimit(b, limitCents) : b,
      ),
    });
    return;
  }
  const category = ALL_CATEGORIES.find((c) => c.id === categoryId)!;
  const spent_cents =
    categoryBreakdown.find((c) => c.category_id === categoryId)?.spent_cents ??
    0;
  const created = withLimit(
    {
      category_id: categoryId,
      name: category.name,
      icon: category.icon,
      color: null,
      spent_cents,
      limit_cents: 0,
      remaining_cents: 0,
      status: "within_limit",
    },
    limitCents,
  );
  set({ ...state, budgets: [...state.budgets, created] });
}

export function deleteBudget(categoryId: number) {
  const index = state.budgets.findIndex((b) => b.category_id === categoryId);
  if (index < 0) return;
  set({
    budgets: state.budgets.filter((_, i) => i !== index),
    lastDeleted: { item: state.budgets[index], index },
  });
}

export function undoDeleteBudget() {
  const deleted = state.lastDeleted;
  if (!deleted) return;
  const budgets = [...state.budgets];
  budgets.splice(deleted.index, 0, deleted.item);
  set({ budgets, lastDeleted: null });
}

export function clearDeletedBudget() {
  if (state.lastDeleted) set({ ...state, lastDeleted: null });
}

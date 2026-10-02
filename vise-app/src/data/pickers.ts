// Category and income-source choices for forms.
//
// Lists what is already stored, plus a few starters that are created the
// first time the user picks one (value "new:<name>"), so a fresh install
// has something to choose from.

import { categoryIcon } from '../components/CategoryIcon';
import type { SelectOption } from '../components/Inputs';
import { starterCategories } from '../features/onboarding/data';
import { addCategory, addIncomeSource } from '../services/viseCore';
import type { ExpenseCategory, IncomeSource } from '../services/types';

const NEW = 'new:';
const STARTER_SOURCES = ['Salary', 'Freelance', 'Refund', 'Other'];

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function categoryOptions(existing: ExpenseCategory[]): SelectOption<string>[] {
  const stored = existing
    .filter((c) => c.is_active)
    .map((c) => ({ value: String(c.id), label: c.name, icon: categoryIcon(c.icon) }));
  const starters = starterCategories
    .filter((s) => !existing.some((c) => sameName(c.name, s.name)))
    .map((s) => ({ value: NEW + s.name, label: s.name, icon: s.icon }));
  return [...stored, ...starters];
}

/** Returns the category id, creating a starter category first if needed. */
export async function resolveCategory(value: string): Promise<number> {
  if (!value.startsWith(NEW)) return Number(value);
  const name = value.slice(NEW.length);
  const icon = starterCategories.find((s) => s.name === name)?.iconName ?? null;
  return (await addCategory({ name, icon })).id;
}

export function sourceOptions(existing: IncomeSource[]): SelectOption<string>[] {
  const stored = existing.filter((s) => s.is_active).map((s) => ({ value: String(s.id), label: s.name }));
  const starters = STARTER_SOURCES.filter((name) => !existing.some((s) => sameName(s.name, name))).map((name) => ({
    value: NEW + name,
    label: name,
  }));
  return [...stored, ...starters];
}

export async function resolveSource(value: string): Promise<number> {
  if (!value.startsWith(NEW)) return Number(value);
  return (await addIncomeSource({ name: value.slice(NEW.length) })).id;
}

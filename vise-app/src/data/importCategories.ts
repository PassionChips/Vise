// Turns the suggestions in an import preview into the choices to send back with the import,
// so "accept all suggestions" is one call and the user only edits the groups that are wrong.

import type { ImportCategoryChoice, ImportGroup } from '../services/types';

/** One choice per group that has a suggestion; groups without one stay uncategorized. */
export function suggestedChoices(groups: ImportGroup[]): ImportCategoryChoice[] {
  return groups.flatMap((group): ImportCategoryChoice[] => {
    const suggestion = group.suggestion;
    if (!suggestion) return [];
    return suggestion.category_id != null
      ? [{ group: group.key, category_id: suggestion.category_id }]
      : [{ group: group.key, new_category: suggestion.name }];
  });
}

/** Replaces (or adds) the choice for one group, e.g. when the user picks another category. */
export function withChoice(choices: ImportCategoryChoice[], choice: ImportCategoryChoice): ImportCategoryChoice[] {
  return [...choices.filter((c) => c.group !== choice.group), choice];
}

/** How many rows the current choices will categorize. */
export function categorizedRowCount(groups: ImportGroup[], choices: ImportCategoryChoice[]): number {
  const chosen = new Set(choices.filter((c) => c.category_id != null || c.new_category).map((c) => c.group));
  return groups.filter((g) => chosen.has(g.key)).reduce((sum, g) => sum + g.rows, 0);
}

// ----- Picker values -----
//
// The category pickers speak in strings: "none", "<category id>" for an existing category and
// "new:<name>" for one the import will create (the same convention as `pickers.ts`).

export const NO_CATEGORY = 'none';
const NEW = 'new:';

/** The picker value for what is currently chosen for a group. */
export function choiceValue(choices: ImportCategoryChoice[], groupKey: string): string {
  const choice = choices.find((c) => c.group === groupKey);
  if (choice?.category_id != null) return String(choice.category_id);
  if (choice?.new_category) return NEW + choice.new_category;
  return NO_CATEGORY;
}

/** Sets a group's choice from a picker value; "none" removes it, leaving the group uncategorized. */
export function applyValue(choices: ImportCategoryChoice[], groupKey: string, value: string): ImportCategoryChoice[] {
  const others = choices.filter((c) => c.group !== groupKey);
  if (value === NO_CATEGORY) return others;
  if (value.startsWith(NEW)) return [...others, { group: groupKey, new_category: value.slice(NEW.length) }];
  return [...others, { group: groupKey, category_id: Number(value) }];
}

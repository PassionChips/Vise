// The state behind the import screen, kept free of React so it can be tested.

import type { SelectOption } from '../components/Inputs';
import type {
  ImportColumn,
  ImportDateOrder,
  ImportDecimalSeparator,
  ImportInput,
  ImportMapping,
  ImportMappingField,
  ImportSampleRow,
  ImportSummary,
} from '../services/types';

/** What the user changed from the detected layout. */
export interface ImportOptions {
  /** Columns the user picked, by number. */
  mapping: Partial<Record<ImportMappingField, number>>;
  /** Fields the user says the file does not have. */
  none: ImportMappingField[];
  dateOrder?: ImportDateOrder;
  decimalSeparator?: ImportDecimalSeparator;
  positiveIs?: 'income' | 'expense';
}

export const emptyOptions: ImportOptions = { mapping: {}, none: [] };

/** The columns the user can correct. The first group is shown, the rest are behind "more". */
export const MAPPING_FIELDS: { field: ImportMappingField; label: string; more: boolean }[] = [
  { field: 'date', label: 'Date', more: false },
  { field: 'description', label: 'Description', more: false },
  { field: 'amount', label: 'Amount', more: false },
  { field: 'debit', label: 'Money out', more: true },
  { field: 'credit', label: 'Money in', more: true },
  { field: 'category', label: 'Category', more: true },
  { field: 'transaction_type', label: 'Type (income / expense)', more: true },
  { field: 'currency', label: 'Currency', more: true },
];

/** The same request for the preview and the save, so the user sees what will be stored. */
export function buildInput(
  content: string,
  options: ImportOptions,
  defaults: { today: string; currency: string },
): ImportInput {
  return {
    content,
    today: defaults.today,
    default_currency: defaults.currency,
    ...(Object.keys(options.mapping).length > 0 && { mapping: options.mapping }),
    ...(options.none.length > 0 && { no_columns: options.none }),
    ...(options.dateOrder && { date_order: options.dateOrder }),
    ...(options.decimalSeparator && { decimal_separator: options.decimalSeparator }),
    ...(options.positiveIs && { positive_is: options.positiveIs }),
  };
}

export const NO_COLUMN = 'none';

/** Picker value for a detected column: its number, or "none". */
export const columnValue = (index: number | null | undefined) => (index == null ? NO_COLUMN : String(index));

/** Records the user's pick for one field. "none" switches the field off. */
export function setColumn(options: ImportOptions, field: ImportMappingField, value: string): ImportOptions {
  const mapping = { ...options.mapping };
  delete mapping[field];
  const none = options.none.filter((f) => f !== field);
  if (value === NO_COLUMN) return { ...options, mapping, none: [...none, field] };
  return { ...options, mapping: { ...mapping, [field]: Number(value) }, none };
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Picker options: "Not in the file", then every column with an example of what it holds. */
export function columnOptions(columns: ImportColumn[]): SelectOption<string>[] {
  return [
    { value: NO_COLUMN, label: 'Not in the file' },
    ...columns.map((c) => ({
      value: String(c.index),
      label: c.example ? `${c.name || `Column ${c.index + 1}`} (${clip(c.example, 24)})` : c.name || `Column ${c.index + 1}`,
    })),
  ];
}

export const DATE_ORDER_LABELS: Record<ImportDateOrder, string> = {
  dmy: 'Day first',
  mdy: 'Month first',
  ymd: 'Year first',
};

export const DECIMAL_LABELS: Record<ImportDecimalSeparator, string> = {
  dot: 'Dot (12.50)',
  comma: 'Comma (12,50)',
};

export const POSITIVE_LABELS = { expense: 'Expenses', income: 'Income' } as const;

/** Reverse lookup for segmented controls, which work on labels. */
export function keyForLabel<K extends string>(labels: Record<K, string>, label: string): K {
  return (Object.keys(labels) as K[]).find((key) => labels[key] === label) as K;
}

/** How a row's date was found, in words, or null if it came from the file. */
export function dateNote(row: ImportSampleRow): string | null {
  switch (row.date_source) {
    case 'above':
      return 'Date taken from the row above';
    case 'below':
      return 'Date taken from the row below';
    case 'import_day':
      return 'No date in the file, using today';
    default:
      return null;
  }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The lines shown after an import. */
export function summaryLines(summary: ImportSummary): string[] {
  const lines = [`${plural(summary.inserted, 'transaction')} imported`];
  if (summary.categorized > 0) lines.push(`${summary.categorized} categorized`);
  if (summary.categories_created > 0) lines.push(`${plural(summary.categories_created, 'new category', 'new categories')} created`);
  if (summary.duplicates > 0) lines.push(`${plural(summary.duplicates, 'duplicate')} skipped`);
  if (summary.filled_dates > 0) lines.push(`${plural(summary.filled_dates, 'date')} filled in from nearby rows`);
  if (summary.error_count > 0) lines.push(`${plural(summary.error_count, 'row')} could not be read`);
  return lines;
}

export type { ImportMapping };

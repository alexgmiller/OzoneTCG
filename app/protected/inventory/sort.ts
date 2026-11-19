// ── Inventory sort: field + direction ──
// The UI picks a field and toggles the direction; SortKey ("date-desc") stays
// the stored form, so saved settings keep working. Pure and dependency-free so
// Settings can import it without pulling in Inventory's pricing code.

import type { SortDir, SortField, SortKey } from "./types";

export const DEFAULT_SORT: SortKey = "date-desc";

export type SortFieldOption = {
  field: SortField;
  label: string;   // menu row
  short: string;   // header trigger
  defaultDir: SortDir;  // where a field starts when you switch to it
  dirLabel: Record<SortDir, string>;
};

const HIGH_LOW: Record<SortDir, string> = { desc: "High to low", asc: "Low to high" };

export const SORT_FIELDS: readonly SortFieldOption[] = [
  { field: "date",    label: "Date",          short: "Date",    defaultDir: "desc", dirLabel: { desc: "Newest first", asc: "Oldest first" } },
  { field: "name",    label: "Name",          short: "Name",    defaultDir: "asc",  dirLabel: { asc: "A to Z", desc: "Z to A" } },
  { field: "market",  label: "Value",         short: "Value",   defaultDir: "desc", dirLabel: HIGH_LOW },
  { field: "cost",    label: "Cost",          short: "Cost",    defaultDir: "desc", dirLabel: HIGH_LOW },
  { field: "sticker", label: "Sticker price", short: "Sticker", defaultDir: "desc", dirLabel: HIGH_LOW },
  { field: "days",    label: "Days in stock", short: "Days",    defaultDir: "desc", dirLabel: { desc: "Longest first", asc: "Shortest first" } },
];

export function sortFieldOption(field: SortField): SortFieldOption {
  return SORT_FIELDS.find((f) => f.field === field) ?? SORT_FIELDS[0];
}

export function toSortKey(field: SortField, dir: SortDir): SortKey {
  return `${field}-${dir}`;
}

export function isSortKey(v: string): v is SortKey {
  const [field, dir, ...rest] = v.split("-");
  return rest.length === 0 && (dir === "asc" || dir === "desc") && SORT_FIELDS.some((f) => f.field === field);
}

// Settings → Default sort (user_settings.default_sort, stored as text): the
// sort Inventory opens with. Missing or unknown → DEFAULT_SORT.
export function sortOrDefault(v: string | null | undefined): SortKey {
  return v && isSortKey(v) ? v : DEFAULT_SORT;
}

// Accepts any string (Settings stores default_sort as text); unknown → DEFAULT_SORT
export function parseSort(k: string): { field: SortField; dir: SortDir } {
  const [field, dir] = (isSortKey(k) ? k : DEFAULT_SORT).split("-") as [SortField, SortDir];
  return { field, dir };
}

// Switching field starts at that field's natural direction; re-picking the
// current field keeps the direction you chose.
export function sortForField(current: SortKey, field: SortField): SortKey {
  return parseSort(current).field === field ? current : toSortKey(field, sortFieldOption(field).defaultDir);
}

export function flipSort(k: SortKey): SortKey {
  const { field, dir } = parseSort(k);
  return toSortKey(field, dir === "desc" ? "asc" : "desc");
}

// "Newest first", "High to low": the direction of this sort in words
export function sortDirLabel(k: SortKey): string {
  const { field, dir } = parseSort(k);
  return sortFieldOption(field).dirLabel[dir];
}

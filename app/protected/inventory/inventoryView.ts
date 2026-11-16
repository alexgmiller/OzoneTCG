// Pure filter / sort / summary for Inventory. No React, no Supabase — the
// hook in useInventoryView.ts memoises these; the test covers them.

import type { Category, ConsignerFilter, Item, SortKey, Status } from "./types";
import { effectiveCost, nullLast } from "./utils";

// "active" = in-stock inventory rows (grading has its own section); "sold" = the sold pool
export type StatusFilter = Status | "active";

export type Filters = {
  search: string;
  category: Category | "all";
  status: StatusFilter;
  // "all" | "none" (not consigned) | "any" (any consigner) | a consigner id
  consigner: ConsignerFilter;
  sort: SortKey;
};

export const defaultFilters: Filters = { search: "", category: "all", status: "active", consigner: "all", sort: "date-desc" };

export function countActiveFilters(f: Filters): number {
  return (f.search.trim() ? 1 : 0) + (f.category !== "all" ? 1 : 0) + (f.status !== "active" ? 1 : 0) + (f.consigner !== "all" ? 1 : 0);
}

export const SORT_OPTIONS: readonly { value: SortKey; label: string }[] = [
  { value: "date-desc",    label: "Newest first" },
  { value: "date-asc",     label: "Oldest first" },
  { value: "name-asc",     label: "Name A→Z" },
  { value: "name-desc",    label: "Name Z→A" },
  { value: "market-desc",  label: "Value high→low" },
  { value: "market-asc",   label: "Value low→high" },
  { value: "cost-desc",    label: "Cost high→low" },
  { value: "cost-asc",     label: "Cost low→high" },
  { value: "sticker-desc", label: "Sticker high→low" },
  { value: "sticker-asc",  label: "Sticker low→high" },
  { value: "days-desc",    label: "Longest in stock" },
  { value: "days-asc",     label: "Newest in stock" },
];

// Short label for the header: "Date ↓", "Value ↑"
export function sortLabel(k: SortKey): string {
  const [field, dir] = k.split("-") as [string, "asc" | "desc"];
  const name = { date: "Date", name: "Name", market: "Value", cost: "Cost", sticker: "Sticker", days: "Days" }[field] ?? field;
  return `${name} ${dir === "desc" ? "↓" : "↑"}`;
}

const DAY_MS = 86_400_000;
export function daysInStock(it: Pick<Item, "created_at" | "acquired_date">, now = new Date()): number {
  const from = new Date(it.acquired_date ?? it.created_at).getTime();
  return Number.isFinite(from) ? Math.max(0, Math.floor((now.getTime() - from) / DAY_MS)) : 0;
}

export function filterItems(items: Item[], f: Filters): Item[] {
  const q = f.search.trim().toLowerCase();
  return items.filter((it) => {
    if (f.status === "active" ? it.status !== "inventory" : it.status !== f.status) return false;
    if (q && !it.name.toLowerCase().includes(q) && !(it.set_name ?? "").toLowerCase().includes(q)) return false;
    if (f.category !== "all" && it.category !== f.category) return false;
    if (f.consigner === "none" && it.owner === "consigner") return false;
    if (f.consigner === "any" && it.owner !== "consigner") return false;
    if (f.consigner !== "all" && f.consigner !== "none" && f.consigner !== "any" && it.consigner_id !== f.consigner) return false;
    return true;
  });
}

export function sortItems(items: Item[], sort: SortKey, priceOf: (it: Item) => number | null, sold: boolean, now = new Date()): Item[] {
  const dateOf = (it: Item) => (sold ? it.sold_at ?? it.created_at : it.created_at);
  return [...items].sort((a, b) => {
    switch (sort) {
      case "name-asc":     return a.name.localeCompare(b.name);
      case "name-desc":    return b.name.localeCompare(a.name);
      case "market-asc":   return nullLast(priceOf(a), priceOf(b), true);
      case "market-desc":  return nullLast(priceOf(a), priceOf(b), false);
      case "cost-asc":     return nullLast(effectiveCost(a), effectiveCost(b), true);
      case "cost-desc":    return nullLast(effectiveCost(a), effectiveCost(b), false);
      case "sticker-asc":  return nullLast(a.sticker_price, b.sticker_price, true);
      case "sticker-desc": return nullLast(a.sticker_price, b.sticker_price, false);
      case "days-asc":     return daysInStock(a, now) - daysInStock(b, now);
      case "days-desc":    return daysInStock(b, now) - daysInStock(a, now);
      case "date-asc":     return dateOf(a).localeCompare(dateOf(b));
      default:             return dateOf(b).localeCompare(dateOf(a));
    }
  });
}

export type Summary = {
  total: number;
  totalCost: number;
  costedCount: number;
  totalCount: number;
  profit: number;
  profitPct: number | null;
};

// Value of the current filter; profit only over items with a known cost
export function summarize(items: Item[], priceFor: (it: Item) => number | null): Summary {
  let total = 0, totalCost = 0, costedCount = 0, costedValue = 0;
  for (const it of items) {
    const price = priceFor(it) ?? 0;
    const value = it.category === "sealed" ? price * (it.quantity ?? 1) : price;
    total += value;
    const ec = effectiveCost(it);
    if (ec != null) { totalCost += ec; costedCount++; costedValue += value; }
  }
  const profit = costedValue - totalCost;
  return { total, totalCost, costedCount, totalCount: items.length, profit, profitPct: totalCost > 0 ? (profit / totalCost) * 100 : null };
}

// ▲ / ▼ for a row or tile: FMV against what we paid
export function priceDelta(price: number | null, cost: number | null): "up" | "down" | null {
  if (price == null || cost == null || price === cost) return null;
  return price > cost ? "up" : "down";
}

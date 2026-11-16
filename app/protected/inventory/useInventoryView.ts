"use client";

import { useMemo } from "react";
import type { Item } from "./types";
import { filterItems, sortItems, summarize, type Filters } from "./inventoryView";

// ── useInventoryView ──
// The visible rows for the current filters, plus the value summary of that
// set. `priceOf` is the live market value, or the sale price for sold rows.
export function useInventoryView(items: Item[], filters: Filters, priceOf: (it: Item) => number | null) {
  const sold = filters.status === "sold";

  const displayedItems = useMemo(
    () => sortItems(filterItems(items, filters), filters.sort, priceOf, sold),
    [items, filters, priceOf, sold],
  );

  const summary = useMemo(() => summarize(displayedItems, priceOf), [displayedItems, priceOf]);

  return { displayedItems, summary, sold };
}

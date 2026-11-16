"use client";

import { useCallback, useMemo, useState } from "react";
import type { Item } from "./types";

// ── useSelection ──
// Multi-select state. Sales go through POS (Sell bundle), so no pricing lives here.
export function useSelection(items: Item[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Explicit selection mode: tapping toggles instead of opening
  const [selecting, setSelecting] = useState(false);

  const selectedItems = useMemo(() => items.filter((it) => selectedIds.has(it.id)), [items, selectedIds]);
  const hasSoldSelected = selectedItems.some((it) => it.status === "sold");
  const totalCost = selectedItems.reduce((s, it) => s + (it.cost_basis ?? it.cost ?? 0), 0);

  const toggleSelect = useCallback((id: string) => {
    setSelecting(true);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelecting(false);
  }, []);

  // Enter selection mode, optionally with one item already checked
  const startSelecting = useCallback((id?: string) => {
    setSelecting(true);
    if (id) setSelectedIds((prev) => new Set(prev).add(id));
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds((prev) => (prev.size === ids.length && ids.length > 0 ? new Set() : new Set(ids)));
  }, []);

  return { selectedIds, selectedItems, selecting, hasSoldSelected, totalCost, toggleSelect, clearSelection, startSelecting, selectAll };
}

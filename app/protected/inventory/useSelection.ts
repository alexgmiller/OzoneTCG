"use client";

import { useCallback, useMemo, useState } from "react";
import type { Item } from "./types";

// ── useSelection ──
// Multi-select state plus the sell-sheet pricing that rides on it: one total,
// auto-allocated across the selection by market value, with per-card manual
// overrides that re-balance the rest.
export function useSelection(items: Item[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Explicit selection mode: tapping toggles instead of opening
  const [selecting, setSelecting] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [salePrice, setSalePrice] = useState("");
  const [manualPrices, setManualPrices] = useState<Record<string, string>>({});

  const selectedItems = useMemo(() => items.filter((it) => selectedIds.has(it.id)), [items, selectedIds]);
  const hasSoldSelected = selectedItems.some((it) => it.status === "sold");
  const totalMarket = selectedItems.reduce((s, it) => s + (it.market ?? 0), 0);
  const totalCost = selectedItems.reduce((s, it) => s + (it.cost_basis ?? it.cost ?? 0), 0);
  const salePriceNum = parseFloat(salePrice) || 0;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelecting(false);
    setSellOpen(false);
    setSalePrice("");
    setManualPrices({});
  }, []);

  // Enter selection mode, optionally with one item already checked
  const startSelecting = useCallback((id?: string) => {
    setSelecting(true);
    if (id) setSelectedIds((prev) => new Set(prev).add(id));
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds((prev) => (prev.size === ids.length && ids.length > 0 ? new Set() : new Set(ids)));
  }, []);

  // ── Sell pricing: manual locks + proportional auto-fill ──
  function autoPrices(total: number, manual: Record<string, string>) {
    const manualSum = selectedItems.reduce((s, it) => s + (manual[it.id] !== undefined ? parseFloat(manual[it.id]) || 0 : 0), 0);
    const autoItems = selectedItems.filter((it) => manual[it.id] === undefined);
    const autoMarketSum = autoItems.reduce((s, it) => s + (it.market ?? 0), 0);
    const remaining = total - manualSum;
    const priceOf = (it: Item) => autoMarketSum > 0
      ? Math.round(((it.market ?? 0) / autoMarketSum) * remaining * 100) / 100
      : autoItems.length > 0 ? Math.round((remaining / autoItems.length) * 100) / 100 : 0;
    return { manualSum, autoItems, priceOf };
  }
  function getCardPrice(it: Item): number {
    if (manualPrices[it.id] !== undefined) return parseFloat(manualPrices[it.id]) || 0;
    return autoPrices(salePriceNum, manualPrices).priceOf(it);
  }
  function updateCardPrice(id: string, value: string) {
    const next = { ...manualPrices, [id]: value };
    setManualPrices(next);
    const { manualSum, autoItems, priceOf } = autoPrices(parseFloat(salePrice) || 0, next);
    setSalePrice((manualSum + autoItems.reduce((s, it) => s + priceOf(it), 0)).toFixed(2));
  }
  function resetCardPrice(id: string) {
    const next = { ...manualPrices };
    delete next[id];
    setManualPrices(next);
  }

  return {
    selectedIds, selectedItems, selecting, hasSoldSelected, totalMarket, totalCost,
    toggleSelect, clearSelection, startSelecting, selectAll,
    sellOpen, setSellOpen, salePrice, setSalePrice, salePriceNum, manualPrices, setManualPrices,
    getCardPrice, updateCardPrice, resetCardPrice,
  };
}

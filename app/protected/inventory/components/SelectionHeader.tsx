"use client";

import { X } from "lucide-react";
import { MoneyDisplay } from "@/components/ui";

// ── Multi-select top bar ──
// Replaces the Inventory header while selecting: X, "3 selected",
// "$1,152 FMV · $890 cost" muted, and Select all for the current filter.
export function SelectionHeader({
  count, fmv, cost, allSelected, onSelectAll, onExit,
}: {
  count: number; fmv: number; cost: number; allSelected: boolean; onSelectAll: () => void; onExit: () => void;
}) {
  return (
    <div className="flex h-12 items-center gap-2">
      <button type="button" onClick={onExit} aria-label="Exit selection" className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground">
        <X size={20} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold tabular-nums text-foreground">{count} selected</div>
        <div className="text-xs tabular-nums text-muted-foreground">
          <MoneyDisplay amount={fmv} tone="neutral" /> FMV · <MoneyDisplay amount={cost} tone="neutral" /> cost
        </div>
      </div>
      <button type="button" onClick={onSelectAll} className="h-11 px-2 text-sm font-medium text-accent">
        {allSelected ? "Deselect all" : "Select all"}
      </button>
    </div>
  );
}

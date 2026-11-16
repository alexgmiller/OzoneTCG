"use client";

import { DollarSign, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Bulk action bar ──
// A pill with the tab bar's styling that sits where the tab bar sits and
// above it in z-order, so it replaces the bar while a selection is active.
// Sell bundle · Edit · Delete. Sold rows can't be sold again, so Sell hides
// when any is selected; sales are reverted from Transactions instead.
export function SelectionBar({
  count, busy, soldSelected, onSell, onEdit, onDelete,
}: {
  count: number; busy: boolean; soldSelected: boolean; onSell: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const btn = "flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-xs font-medium transition-colors duration-150 disabled:opacity-40";
  return (
    <nav
      aria-label="Selection actions"
      className="tabbar-inset fixed inset-x-4 z-50 flex h-16 items-center gap-1 rounded-full bg-tabbar px-2 shadow-tabbar backdrop-blur-md md:inset-x-auto md:left-24 md:right-6"
    >
      {!soldSelected && (
        <button type="button" onClick={onSell} disabled={busy || count === 0} className={cn(btn, "text-accent hover:bg-surface-2")}>
          <DollarSign size={20} strokeWidth={2} />
          Sell bundle
        </button>
      )}
      <button type="button" onClick={onEdit} disabled={busy || count === 0 || soldSelected} className={cn(btn, "text-foreground hover:bg-surface-2")}>
        <Pencil size={20} strokeWidth={1.75} />
        Edit
      </button>
      <button type="button" onClick={onDelete} disabled={busy || count === 0} className={cn(btn, "text-down hover:bg-surface-2")}>
        <Trash2 size={20} strokeWidth={1.75} />
        Delete
      </button>
    </nav>
  );
}

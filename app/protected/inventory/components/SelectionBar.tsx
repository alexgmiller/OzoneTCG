"use client";

import { btnPrimary, btnOutline } from "../utils";

// ── Bulk action bar ──
// Sits where the floating tab bar sits and above it in z-order, so it replaces
// the bar while a selection is active (the multi-select commit restyles it as
// a pill). On desktop it spans the content area to the right of the rail.
// Sold rows can't be sold again or price-refreshed, so those actions hide when any is selected.
export function SelectionBar({
  count,
  busy,
  soldSelected,
  onSell,
  onRefresh,
  onSetCost,
  onEdit,
  onDelete,
  onClear,
}: {
  count: number;
  busy: boolean;
  soldSelected: boolean;
  onSell: () => void;
  onRefresh: () => void;
  onSetCost: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="tabbar-inset fixed inset-x-4 z-50 rounded-2xl border border-border bg-surface md:inset-x-0 md:bottom-0 md:left-20 md:rounded-none md:border-x-0 md:border-b-0">
      <div className="mx-auto w-full max-w-3xl space-y-2 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground tabular-nums">{count} selected</span>
          <button className="h-11 px-2 text-sm text-muted-foreground hover:text-foreground" onClick={onClear}>Clear</button>
        </div>
        <div className={`grid gap-2 ${soldSelected ? "grid-cols-2" : "grid-cols-5"}`}>
          {!soldSelected && (
            <>
              <button className={`${btnPrimary} col-span-2 px-2`} onClick={onSell} disabled={busy}>Sell</button>
              <button className={`${btnOutline} px-2`} onClick={onRefresh} disabled={busy} title="Refresh prices">↻</button>
            </>
          )}
          <button className={`${btnOutline} px-2`} onClick={onSetCost} disabled={busy}>Cost</button>
          {/* Sold rows keep their sale fields; undo a sale from Transactions instead */}
          {!soldSelected && <button className={`${btnOutline} px-2`} onClick={onEdit} disabled={busy}>Edit</button>}
        </div>
        <button className="h-11 w-full text-sm font-medium text-negative" onClick={onDelete} disabled={busy}>
          Delete {count} item{count !== 1 ? "s" : ""}
        </button>
      </div>
    </div>
  );
}

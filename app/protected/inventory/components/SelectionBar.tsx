"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";

// ── Bulk action bar (fixed above the mobile tab bar) ──
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
    <div className="fixed inset-x-0 bottom-16 z-40 border-t border-border bg-background md:bottom-0 md:left-56">
      <div className="mx-auto w-full max-w-3xl space-y-2 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground tabular-nums">{count} selected</span>
          <Button variant="ghost" size="sm" className="px-2" onClick={onClear}>Clear</Button>
        </div>
        <div className={`grid gap-2 ${soldSelected ? "grid-cols-2" : "grid-cols-5"}`}>
          {!soldSelected && (
            <>
              <Button className="col-span-2 px-2" onClick={onSell} disabled={busy}>Sell</Button>
              <Button variant="outline" className="px-2" onClick={onRefresh} disabled={busy} title="Refresh prices" aria-label="Refresh prices"><RefreshCw size={16} /></Button>
            </>
          )}
          <Button variant="outline" className="px-2" onClick={onSetCost} disabled={busy}>Cost</Button>
          {/* Sold rows keep their sale fields; undo a sale from Transactions instead */}
          {!soldSelected && <Button variant="outline" className="px-2" onClick={onEdit} disabled={busy}>Edit</Button>}
        </div>
        <Button variant="destructive-ghost" className="w-full" onClick={onDelete} disabled={busy}>
          Delete {count} item{count !== 1 ? "s" : ""}
        </Button>
      </div>
    </div>
  );
}

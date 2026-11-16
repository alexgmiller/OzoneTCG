"use client";

import { EmptyState } from "@/components/ui";
import { btnOutline, btnPrimary } from "../utils";

// ── Empty states ──
// `totalCount` is the size of the unfiltered pool (in-stock items, or sold under the Sold filter).
export function InventoryEmpty({
  totalCount, soldFilter, onAdd, onClearFilters,
}: {
  totalCount: number; soldFilter: boolean; onAdd: () => void; onClearFilters: () => void;
}) {
  if (totalCount === 0) {
    return soldFilter ? (
      <EmptyState
        title="Nothing sold yet"
        hint="Items you sell from here or the POS show up in this list with their sale price."
        cta={<button className={`${btnOutline} w-full`} onClick={onClearFilters}>Back to in-stock items</button>}
      />
    ) : (
      <EmptyState
        title="No items yet"
        hint="Add a card, slab or sealed product and it shows up here with live pricing."
        preview={
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 2 }).map((_, i) => <div key={i} className="aspect-[63/88] rounded-2xl bg-surface-2" />)}
          </div>
        }
        cta={<button className={`${btnPrimary} w-full`} onClick={onAdd}>Add your first item</button>}
      />
    );
  }
  return (
    <EmptyState
      title="No items match"
      hint="Try a different search or clear the filters."
      cta={<button className={`${btnOutline} w-full`} onClick={onClearFilters}>Clear filters</button>}
    />
  );
}

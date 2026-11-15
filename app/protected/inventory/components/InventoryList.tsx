"use client";

import { Badge, Button, EmptyState, MoneyDisplay } from "@/components/ui";
import type { ConsignerOption, Item } from "../types";
import { effectiveCost, sealedTypeLabel, conditionShort, statusLabel, setLine, fmtDate } from "../utils";

// ── Item card ──
// `price` is the live market value, or the sale price for sold rows.
function ItemCard({
  it,
  price,
  consigner,
  selected,
  refreshing,
  toggleSelect,
  openDetail,
}: {
  it: Item;
  price: number | null;
  consigner: ConsignerOption | null;
  selected: boolean;
  refreshing: boolean;
  toggleSelect: (id: string) => void;
  openDetail: (it: Item) => void;
}) {
  const cost = effectiveCost(it);
  const sold = it.status === "sold";
  return (
    <div className={`flex items-stretch rounded-xl border bg-card transition-colors duration-150 ${selected ? "border-accent-primary-border bg-accent-primary-soft" : "border-border"}`}>
      <label className="flex shrink-0 cursor-pointer items-center pl-3 pr-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => toggleSelect(it.id)}
          className="h-5 w-5 accent-accent-primary"
          aria-label={`Select ${it.name}`}
        />
      </label>
      <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-3 pr-3 text-left" onClick={() => openDetail(it)}>
        <div className="w-14 shrink-0">
          {it.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={it.image_url} alt="" loading="lazy" className="h-auto w-full rounded-lg object-cover" />
          ) : (
            <div className="flex aspect-[5/7] w-full items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
              {it.category === "sealed" ? "PKG" : "?"}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="truncate text-sm font-semibold text-foreground">{it.name}</div>
          {setLine(it) && <div className="truncate text-xs text-muted-foreground">{setLine(it)}</div>}
          <div className="flex flex-wrap items-center gap-1.5">
            {it.grade && <Badge tone="accent">{it.grade}</Badge>}
            {it.category === "single" && it.condition && <Badge>{conditionShort(it.condition)}</Badge>}
            {it.category === "sealed" && <Badge>{sealedTypeLabel(it.product_type)}{it.quantity > 1 ? ` ×${it.quantity}` : ""}</Badge>}
            <Badge tone={sold ? "positive" : it.owner === "consigner" ? "warning" : "neutral"}>{statusLabel(it)}{consigner ? ` · ${consigner.name}` : ""}</Badge>
            {sold && it.sold_at && <span className="text-xs text-muted-foreground">{fmtDate(it.sold_at)}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {refreshing ? (
            <span className="inline-block animate-spin text-base text-muted-foreground">↻</span>
          ) : price != null ? (
            <MoneyDisplay amount={price} tone={sold ? "positive" : "neutral"} className="text-base font-semibold" />
          ) : (
            <span className="text-sm text-muted-foreground">No price</span>
          )}
          <span className="text-xs text-muted-foreground">
            {cost != null ? <>Cost <MoneyDisplay amount={cost} tone="neutral" /></> : "No cost"}
          </span>
        </div>
      </button>
    </div>
  );
}

// ── Inventory list ──
// `totalCount` is the size of the unfiltered pool (active items, or sold items under the Sold filter).
export function InventoryList({
  items,
  totalCount,
  soldFilter,
  priceFor,
  consignerMap,
  selectedIds,
  refreshingIds,
  toggleSelect,
  openDetail,
  onAdd,
  onClearFilters,
}: {
  items: Item[];
  totalCount: number;
  soldFilter: boolean;
  priceFor: (it: Item) => number | null;
  consignerMap: Map<string, ConsignerOption>;
  selectedIds: Set<string>;
  refreshingIds: Record<string, boolean>;
  toggleSelect: (id: string) => void;
  openDetail: (it: Item) => void;
  onAdd: () => void;
  onClearFilters: () => void;
}) {
  if (totalCount === 0) {
    return soldFilter ? (
      <EmptyState
        title="Nothing sold yet"
        hint="Items you sell from here or the POS show up in this list with their sale price."
        cta={<Button variant="outline" className="w-full" onClick={onClearFilters}>Back to active items</Button>}
      />
    ) : (
      <EmptyState
        title="No items yet"
        hint="Add a card, slab or sealed product and it shows up here with live pricing."
        cta={<Button className="w-full" onClick={onAdd}>Add your first item</Button>}
      />
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title="No items match"
        hint="Try a different search or clear the filters."
        cta={<Button variant="outline" className="w-full" onClick={onClearFilters}>Clear filters</Button>}
      />
    );
  }
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <ItemCard
          key={it.id}
          it={it}
          price={priceFor(it)}
          consigner={it.consigner_id ? consignerMap.get(it.consigner_id) ?? null : null}
          selected={selectedIds.has(it.id)}
          refreshing={!!refreshingIds[it.id]}
          toggleSelect={toggleSelect}
          openDetail={openDetail}
        />
      ))}
    </div>
  );
}

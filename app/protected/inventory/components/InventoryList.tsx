"use client";

import CardImage from "@/components/CardImage";
import { Badge, Button, EmptyState, MoneyDisplay, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { ConsignerOption, Item } from "../types";
import { effectiveCost, sealedTypeLabel, conditionShort, statusLabel, setLine, fmtDate } from "../utils";

export type InventoryView = "list" | "grid";

type CardProps = {
  it: Item;
  price: number | null;
  consigner: ConsignerOption | null;
  selected: boolean;
  refreshing: boolean;
  toggleSelect: (id: string) => void;
  openDetail: (it: Item) => void;
};

// ── Shared bits ──

function SelectBox({ it, selected, toggleSelect, className }: Pick<CardProps, "it" | "selected" | "toggleSelect"> & { className?: string }) {
  return (
    <label className={cn("flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center", className)}>
      <input
        type="checkbox"
        checked={selected}
        onChange={() => toggleSelect(it.id)}
        className="h-5 w-5 accent-accent-primary"
        aria-label={`Select ${it.name}`}
      />
    </label>
  );
}

// Grade for slabs, condition for singles, product type for sealed
function KindBadge({ it }: { it: Item }) {
  if (it.grade) return <Badge tone="accent">{it.grade}</Badge>;
  if (it.category === "single" && it.condition) return <Badge>{conditionShort(it.condition)}</Badge>;
  if (it.category === "sealed")
    return <Badge>{sealedTypeLabel(it.product_type)}{it.quantity > 1 ? ` ×${it.quantity}` : ""}</Badge>;
  return null;
}

function Price({ price, sold, refreshing, className }: { price: number | null; sold: boolean; refreshing: boolean; className?: string }) {
  if (refreshing) return <Skeleton className="h-6 w-16" />;
  if (price == null) return <span className="text-sm text-muted-foreground">No price</span>;
  return <MoneyDisplay amount={price} tone={sold ? "positive" : "neutral"} className={cn("text-base font-semibold", className)} />;
}

// ── List row ──
// `price` is the live market value, or the sale price for sold rows.
function ItemRow({ it, price, consigner, selected, refreshing, toggleSelect, openDetail }: CardProps) {
  const cost = effectiveCost(it);
  const sold = it.status === "sold";
  return (
    <div className={cn(
      "flex items-stretch rounded-xl border bg-card transition-colors duration-150",
      selected ? "border-accent-primary-border bg-accent-primary-soft" : "border-border",
    )}>
      <SelectBox it={it} selected={selected} toggleSelect={toggleSelect} className="h-auto self-stretch pl-1" />
      <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-3 pr-3 text-left" onClick={() => openDetail(it)}>
        {/* Fixed 5:7 thumbnail so rows keep their height while images load */}
        <div className="flex aspect-card w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-xs text-muted-foreground">
          {it.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={it.image_url} alt="" loading="lazy" className="h-full w-full object-contain" />
          ) : (
            it.category === "sealed" ? "PKG" : "?"
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="truncate text-sm font-semibold text-foreground">{it.name}</div>
          {setLine(it) && <div className="truncate text-xs text-muted-foreground">{setLine(it)}</div>}
          <div className="flex flex-wrap items-center gap-1.5">
            <KindBadge it={it} />
            <Badge tone={sold ? "positive" : it.owner === "consigner" ? "warning" : "neutral"}>{statusLabel(it)}{consigner ? ` · ${consigner.name}` : ""}</Badge>
            {sold && it.sold_at && <span className="text-xs text-muted-foreground">{fmtDate(it.sold_at)}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <Price price={price} sold={sold} refreshing={refreshing} />
          <span className="text-xs text-muted-foreground">
            {cost != null ? <>Cost <MoneyDisplay amount={cost} tone="neutral" /></> : "No cost"}
          </span>
        </div>
      </button>
    </div>
  );
}

// ── Grid tile ──
// The card image is the product, so it leads. Status only shows when it isn't
// plain "in inventory" (sold, consigned, grading…).
function ItemTile({ it, price, consigner, selected, refreshing, toggleSelect, openDetail }: CardProps) {
  const sold = it.status === "sold";
  const flagged = sold || it.owner === "consigner" || it.status !== "inventory";
  return (
    <div className={cn(
      "relative flex flex-col overflow-hidden rounded-xl border bg-card transition-colors duration-150",
      selected ? "border-accent-primary-border bg-accent-primary-soft" : "border-border hover:bg-muted",
    )}>
      <button type="button" className="flex flex-1 flex-col gap-2 p-2.5 text-left" onClick={() => openDetail(it)}>
        <CardImage src={it.image_url} name={it.name} setName={it.set_name} cardNumber={it.card_number} />
        <div className="min-w-0 space-y-1">
          <div className="truncate text-sm font-semibold text-foreground">{it.name}</div>
          <div className="flex min-h-6 flex-wrap items-center gap-1">
            <KindBadge it={it} />
            {flagged && (
              <Badge tone={sold ? "positive" : it.owner === "consigner" ? "warning" : "neutral"}>
                {statusLabel(it)}{consigner ? ` · ${consigner.name}` : ""}
              </Badge>
            )}
          </div>
          <Price price={price} sold={sold} refreshing={refreshing} />
        </div>
      </button>
      {/* Selection sits over the image corner, outside the tile button */}
      <SelectBox
        it={it}
        selected={selected}
        toggleSelect={toggleSelect}
        className="absolute left-1 top-1 rounded-full bg-background/80"
      />
    </div>
  );
}

// ── Empty-state preview ── a ghost of the grid that will fill in
function GhostGrid() {
  return (
    <div className="grid grid-cols-3 gap-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-1.5">
          <div className="aspect-card rounded-lg border border-dashed border-border bg-muted" />
          <div className="h-2.5 w-3/4 rounded-full bg-muted" />
          <div className="h-2.5 w-1/2 rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}

// ── Inventory list ──
// `totalCount` is the size of the unfiltered pool (active items, or sold items under the Sold filter).
export function InventoryList({
  items,
  view,
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
  view: InventoryView;
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
        title="Your inventory starts here"
        hint="Add a slab, single or sealed product. Each one gets live pricing from eBay and JustTCG."
        preview={<GhostGrid />}
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

  const Card = view === "grid" ? ItemTile : ItemRow;
  return (
    <div className={view === "grid" ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" : "space-y-2"}>
      {items.map((it) => (
        <Card
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

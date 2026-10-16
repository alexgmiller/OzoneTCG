"use client";

import { CardTile, useLongPress, type PressPoint } from "@/components/ui";
import type { Item } from "../types";
import { priceDelta } from "../inventoryView";
import { rowMeta } from "./CardRow";

// ── Inventory grid ──
// 2 columns on a phone, 4–5 on desktop, 12px gap, CardTiles.
type Props = {
  items: Item[];
  priceOf: (it: Item) => number | null;
  costOf: (it: Item) => number | null;
  selecting: boolean;
  selectedIds: Set<string>;
  onOpen: (it: Item) => void;
  onToggle: (id: string) => void;
  onContext: (it: Item, at: PressPoint) => void;
};

export function InventoryGrid({ items, priceOf, costOf, selecting, selectedIds, onOpen, onToggle, onContext }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
      {items.map((it) => (
        <GridTile
          key={it.id}
          it={it}
          price={priceOf(it)}
          cost={costOf(it)}
          selecting={selecting}
          selected={selectedIds.has(it.id)}
          onOpen={onOpen}
          onToggle={onToggle}
          onContext={onContext}
        />
      ))}
    </div>
  );
}

function GridTile({
  it, price, cost, selecting, selected, onOpen, onToggle, onContext,
}: {
  it: Item; price: number | null; cost: number | null; selecting: boolean; selected: boolean;
  onOpen: (it: Item) => void; onToggle: (id: string) => void; onContext: (it: Item, at: PressPoint) => void;
}) {
  const press = useLongPress((p) => onContext(it, p), !selecting);
  return (
    <div data-item-id={it.id} {...press}>
      <CardTile
        name={it.name}
        setNumber={it.card_number}
        meta={rowMeta(it) || null}
        price={price}
        delta={priceDelta(price, cost)}
        imageUrl={it.image_url}
        consigned={it.owner === "consigner"}
        selected={selected}
        onClick={() => (selecting ? onToggle(it.id) : onOpen(it))}
      />
    </div>
  );
}

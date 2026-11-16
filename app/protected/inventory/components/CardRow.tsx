"use client";

import { useEffect, useRef, useState } from "react";
import { MoneyDisplay, useLongPress, type PressPoint } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Item } from "../types";
import { conditionShort, sealedTypeLabel, setLine, statusLabel } from "../utils";
import { priceDelta } from "../inventoryView";

// ── CardRow ──
// 64px list row on --surface with a bottom hairline.
//   left    40×56 thumbnail, rounded 6
//   middle  name + set number muted / grade or variant in muted mono + badge
//   right   price bold / cost muted with ▲▼ delta
// Long-press (or right-click) opens the item context menu.
type Props = {
  it: Item;
  price: number | null;
  cost: number | null;
  selecting: boolean;
  selected: boolean;
  onOpen: (it: Item) => void;
  onToggle: (id: string) => void;
  onContext: (it: Item, at: PressPoint) => void;
};

export function rowMeta(it: Item): string {
  if (it.category === "slab") return it.grade ?? "";
  if (it.category === "sealed") return `${sealedTypeLabel(it.product_type)}${it.quantity > 1 ? ` ×${it.quantity}` : ""}`;
  return conditionShort(it.condition);
}

export function CardRow({ it, price, cost, selecting, selected, onOpen, onToggle, onContext }: Props) {
  const press = useLongPress((p) => onContext(it, p), !selecting);
  const delta = priceDelta(price, cost);
  const sold = it.status === "sold";
  const consigned = it.owner === "consigner";
  const meta = rowMeta(it);
  // Dead art falls back to the blank thumb; the mount check covers an error
  // that fires on the server-rendered <img> before hydration attaches onError
  const [broken, setBroken] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    setBroken(false);
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth === 0) setBroken(true);
  }, [it.image_url]);

  return (
    <button
      type="button"
      data-item-id={it.id}
      aria-pressed={selecting ? selected : undefined}
      onClick={() => (selecting ? onToggle(it.id) : onOpen(it))}
      {...press}
      className={cn(
        "flex h-16 w-full items-center gap-3 border-b border-border bg-surface px-3 text-left transition-colors duration-150 last:border-b-0 hover:bg-surface-2",
        selected && "bg-accent-tint",
      )}
    >
      {selecting && (
        <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", selected ? "border-accent bg-accent" : "border-border")} aria-hidden>
          {selected && <span className="h-2 w-2 rounded-full bg-bg" />}
        </span>
      )}

      <div className="h-14 w-10 shrink-0 overflow-hidden rounded-thumb bg-surface-2">
        {it.image_url && !broken && (
          // eslint-disable-next-line @next/next/no-img-element
          <img ref={imgRef} src={it.image_url} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">{it.name}</span>
          {it.card_number && <span className="shrink-0 text-xs text-muted-foreground">#{it.card_number}</span>}
        </div>
        <div className="flex items-center gap-2 text-xs">
          {meta && <span className="truncate font-mono text-muted-foreground">{meta}</span>}
          {(sold || consigned || it.status === "grading") && (
            <span className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 font-medium",
              sold ? "bg-up-tint text-up" : consigned ? "bg-accent-tint text-accent" : "bg-surface-2 text-muted-foreground",
            )}>
              {statusLabel(it)}
            </span>
          )}
          {!meta && !sold && !consigned && setLine(it) && <span className="truncate text-muted-foreground">{setLine(it)}</span>}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end">
        {price != null
          ? <MoneyDisplay amount={price} tone="neutral" className="text-sm font-bold" />
          : <span className="text-sm text-muted-foreground">No price</span>}
        <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
          {cost != null ? <MoneyDisplay amount={cost} tone="neutral" /> : "No cost"}
          {delta === "up"   && <span className="text-up">▲</span>}
          {delta === "down" && <span className="text-down">▼</span>}
        </span>
      </div>
    </button>
  );
}

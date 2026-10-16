"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { MoneyDisplay, type PressPoint } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Item, SortKey } from "../types";
import { statusLabel } from "../utils";
import { daysInStock, priceDelta } from "../inventoryView";
import { CardRow, rowMeta } from "./CardRow";

// ── Inventory list ──
// Phones get CardRows. Desktop gets a table with sortable columns (cost, FMV,
// sticker, days in stock) and always-visible row checkboxes for bulk edit.
type Props = {
  items: Item[];
  priceOf: (it: Item) => number | null;
  costOf: (it: Item) => number | null;
  selecting: boolean;
  selectedIds: Set<string>;
  sort: SortKey;
  setSort: (k: SortKey) => void;
  onOpen: (it: Item) => void;
  onToggle: (id: string) => void;
  onContext: (it: Item, at: PressPoint) => void;
};

type Col = { key: "cost" | "market" | "sticker" | "days"; label: string };
const COLS: readonly Col[] = [
  { key: "cost", label: "Cost" }, { key: "market", label: "FMV" }, { key: "sticker", label: "Sticker" }, { key: "days", label: "Days" },
];

export function InventoryListView({ items, priceOf, costOf, selecting, selectedIds, sort, setSort, onOpen, onToggle, onContext }: Props) {
  const now = new Date();
  const [sortField, sortDir] = sort.split("-") as [string, "asc" | "desc"];
  const clickHeader = (key: Col["key"]) =>
    setSort(`${key}-${sortField === key && sortDir === "desc" ? "asc" : "desc"}` as SortKey);

  return (
    <>
      {/* ── Phone ── */}
      <div className="overflow-hidden rounded-2xl md:hidden">
        {items.map((it) => (
          <CardRow
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

      {/* ── Desktop ── */}
      <table className="hidden w-full md:table">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="w-10 px-3 py-2" aria-label="Select" />
            <th className="px-3 py-2 font-medium">Item</th>
            <th className="px-3 py-2 font-medium">Grade</th>
            {COLS.map((c) => (
              <th key={c.key} className="px-3 py-2 text-right font-medium">
                <button type="button" onClick={() => clickHeader(c.key)} className={cn("inline-flex items-center gap-1 hover:text-foreground", sortField === c.key && "text-foreground")}>
                  {c.label}
                  {sortField === c.key && (sortDir === "desc" ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                </button>
              </th>
            ))}
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="rounded-2xl bg-surface">
          {items.map((it) => {
            const price = priceOf(it), cost = costOf(it), delta = priceDelta(price, cost);
            const selected = selectedIds.has(it.id);
            return (
              <tr
                key={it.id}
                data-item-id={it.id}
                onContextMenu={(e) => { e.preventDefault(); onContext(it, { x: e.clientX, y: e.clientY }); }}
                className={cn("h-16 border-b border-border bg-surface transition-colors duration-150 hover:bg-surface-2", selected && "bg-accent-tint")}
              >
                <td className="px-3">
                  <input type="checkbox" checked={selected} onChange={() => onToggle(it.id)} aria-label={`Select ${it.name}`} className="h-4 w-4 accent-accent" />
                </td>
                <td className="px-3">
                  <button type="button" onClick={() => onOpen(it)} className="flex items-center gap-3 text-left">
                    <span className="h-14 w-10 shrink-0 overflow-hidden rounded-thumb bg-surface-2">
                      {it.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{it.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[it.set_name, it.card_number && `#${it.card_number}`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                </td>
                <td className="px-3 font-mono text-xs text-muted-foreground">{rowMeta(it)}</td>
                <td className="px-3 text-right text-sm tabular-nums text-muted-foreground">{cost != null ? <MoneyDisplay amount={cost} tone="neutral" /> : "—"}</td>
                <td className="px-3 text-right">
                  <span className="inline-flex items-center gap-1 text-sm font-bold tabular-nums">
                    {price != null ? <MoneyDisplay amount={price} tone="neutral" /> : <span className="font-normal text-muted-foreground">—</span>}
                    {delta === "up" && <span className="text-xs text-up">▲</span>}
                    {delta === "down" && <span className="text-xs text-down">▼</span>}
                  </span>
                </td>
                <td className="px-3 text-right text-sm tabular-nums text-muted-foreground">{it.sticker_price != null ? <MoneyDisplay amount={it.sticker_price} tone="neutral" /> : "—"}</td>
                <td className="px-3 text-right text-sm tabular-nums text-muted-foreground">{it.status === "sold" ? "—" : daysInStock(it, now)}</td>
                <td className="px-3 text-xs text-muted-foreground">{statusLabel(it)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

"use client";

import { ChevronDown, ChevronUp, ScanLine, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui";
import { MoneyOrDash, offerValue, type BatchItem } from "./shared";

// ── BatchList ──
// Collapsible list of cards scanned this session, with totals and bulk actions.

export function BatchList({
  batch,
  open,
  onToggle,
  totalMarket,
  totalOffer,
  actionLoading,
  onRemove,
  onAddAll,
  onBulkBuy,
  onClear,
}: {
  batch: BatchItem[];
  open: boolean;
  onToggle: () => void;
  totalMarket: number;
  totalOffer: number;
  actionLoading: boolean;
  onRemove: (id: string) => void;
  onAddAll: () => void;
  onBulkBuy: () => void;
  onClear: () => void;
}) {
  if (batch.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-muted"
      >
        <div className="flex min-w-0 items-center gap-2">
          <ScanLine size={16} className="shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium tabular-nums">
            {batch.length} card{batch.length !== 1 ? "s" : ""} scanned
          </span>
          <span className="truncate text-xs text-muted-foreground">
            · Offer <MoneyOrDash amount={totalOffer} />
          </span>
        </div>
        {open ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border">
          <div className="divide-y divide-border">
            {batch.map((item, i) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground tabular-nums">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.company} {item.grade}
                    {item.cardNumber ? ` · #${item.cardNumber}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold"><MoneyOrDash amount={item.market} /></div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {item.offerPct}% = <MoneyOrDash amount={offerValue(item.market, item.offerPct)} />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(item.id)}
                  aria-label="Remove from batch"
                  className="shrink-0"
                >
                  <X size={16} />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-3 border-t border-border p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total market</span>
              <span className="font-semibold"><MoneyOrDash amount={totalMarket} /></span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total at offer %</span>
              <span className="font-semibold text-accent-primary"><MoneyOrDash amount={totalOffer} /></span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" size="lg" onClick={onAddAll} disabled={actionLoading}>
                Add all
              </Button>
              <Button size="lg" onClick={onBulkBuy} disabled={actionLoading}>
                Bulk buy
              </Button>
            </div>
            <Button variant="ghost" onClick={onClear} className="w-full hover:text-negative">
              <Trash2 size={14} />
              Clear list
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

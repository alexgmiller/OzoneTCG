"use client";

import { StatCard, MoneyDisplay } from "@/components/ui";
import { EBAY_DAILY_BUDGET } from "../utils";

export type Summary = {
  total: number;
  totalCost: number;
  costedCount: number;
  totalCount: number;
  profit: number;
  profitPct: number | null;
};

export type BgStatus = "idle" | "running" | "done" | "rate_limited";

// ── Value summary + auto-refresh status ──
export function InventorySummary({
  summary,
  bgStatus,
  bgStaleCount,
  dailyCallCount,
}: {
  summary: Summary;
  bgStatus: BgStatus;
  bgStaleCount: number;
  dailyCallCount: number;
}) {
  const s = summary;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Inventory value"
          money={s.total}
          delta={<span className="tabular-nums">{s.totalCount} item{s.totalCount !== 1 ? "s" : ""}</span>}
        />
        <StatCard
          label="Profit"
          value={s.totalCost > 0 ? <MoneyDisplay amount={s.profit} showSign /> : <span className="text-muted-foreground">—</span>}
          delta={
            s.totalCost > 0 ? (
              <span className="tabular-nums">
                {s.profitPct != null ? `${s.profitPct >= 0 ? "+" : ""}${s.profitPct.toFixed(0)}% · ` : ""}
                {s.costedCount} of {s.totalCount} costed
              </span>
            ) : (
              "Add costs to track profit"
            )
          }
        />
      </div>

      {bgStatus === "rate_limited" && (
        <div className="rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-xs text-warning-strong tabular-nums">
          Auto-refresh paused — daily eBay limit nearly reached ({dailyCallCount.toLocaleString()} / {EBAY_DAILY_BUDGET.toLocaleString()} calls). Manual refresh still works.
        </div>
      )}
      {bgStatus === "running" && bgStaleCount > 0 && (
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground tabular-nums">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent-primary" />
          Updating slab prices… {bgStaleCount} remaining
        </div>
      )}
    </div>
  );
}

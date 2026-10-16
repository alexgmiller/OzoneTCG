"use client";

import { EBAY_DAILY_BUDGET } from "../utils";

export type BgStatus = "idle" | "running" | "done" | "rate_limited";

// ── Background pricing status ──
// Quiet lines under the header while slab prices refresh or when the eBay
// budget is nearly spent. The value summary itself is the header's HeroValue.
export function PricingStatus({ bgStatus, bgStaleCount, dailyCallCount }: { bgStatus: BgStatus; bgStaleCount: number; dailyCallCount: number }) {
  if (bgStatus === "rate_limited") {
    return (
      <div className="rounded-xl bg-warning-soft px-3 py-2 text-xs tabular-nums text-warning-strong">
        Auto-refresh paused — daily eBay limit nearly reached ({dailyCallCount.toLocaleString()} / {EBAY_DAILY_BUDGET.toLocaleString()} calls). Manual refresh still works.
      </div>
    );
  }
  if (bgStatus === "running" && bgStaleCount > 0) {
    return (
      <div className="flex items-center gap-2 px-1 text-xs tabular-nums text-muted-foreground">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
        Updating slab prices… {bgStaleCount} remaining
      </div>
    );
  }
  return null;
}

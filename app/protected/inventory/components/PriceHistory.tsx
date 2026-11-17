"use client";

import { useEffect, useState } from "react";
import { TrendChart } from "@/components/charts/TrendChart";
import { MoneyDisplay, Skeleton } from "@/components/ui";
import { historyChange, type HistoryPoint } from "@/lib/priceHistory";
import { getItemPriceHistory } from "../actions";

// ── Price history ──
// An item's market value night by night (item_price_history), as the Home
// value chart draws it: the change since the first point, then the line. The
// 03:00 job adds a point each night, so a new item shows a note until it has two.
export function PriceHistory({ itemId, label = "Price history" }: { itemId: string; label?: string }) {
  const [points, setPoints] = useState<HistoryPoint[] | null>(null);

  useEffect(() => {
    let live = true;
    setPoints(null);
    getItemPriceHistory(itemId)
      .then((p) => { if (live) setPoints(p); })
      .catch(() => { if (live) setPoints([]); });
    return () => { live = false; };
  }, [itemId]);

  const change = points ? historyChange(points) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="section-label">{label}</span>
        {change && (
          <span className="flex items-baseline gap-1 text-xs">
            <MoneyDisplay amount={change.amount} showSign className="font-semibold" />
            {change.pct != null && (
              <span className="tabular-nums text-muted-foreground">
                ({change.pct >= 0 ? "+" : ""}{change.pct.toFixed(1)}%) since {shortDate(points![0].date)}
              </span>
            )}
          </span>
        )}
      </div>
      {points === null ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : points.length < 2 ? (
        <p className="text-sm text-muted-foreground">
          {points.length === 0
            ? "No history yet. The nightly price update adds a point every night."
            : "One point so far. The line starts after the next nightly update."}
        </p>
      ) : (
        <TrendChart
          data={points}
          tone={change && change.amount < 0 ? "down" : change && change.amount > 0 ? "up" : "accent"}
          className="h-24"
          format={(v) => `$${v.toFixed(2)}`}
        />
      )}
    </div>
  );
}

// Points are UTC day keys; read them in UTC so the date doesn't slip a day
const shortFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const shortDate = (d: string) => shortFmt.format(new Date(d));

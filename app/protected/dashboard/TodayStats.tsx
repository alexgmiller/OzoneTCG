"use client";

import { useEffect, useState } from "react";
import { MoneyDisplay, Skeleton, StatCard } from "@/components/ui";
import { computeToday, localDayKey, type TxRow } from "./activity";

// ── Today's tiles ──
// "Today" is the browser's local day, so the day key is resolved after mount
// and the tiles show a skeleton during SSR / hydration.

export default function TodayStats({ rows }: { rows: TxRow[] }) {
  const [dayKey, setDayKey] = useState<string | null>(null);
  useEffect(() => {
    setDayKey(localDayKey(new Date()));
  }, []);

  if (!dayKey) return <TodayStatsSkeleton />;

  const t = computeToday(rows, dayKey);
  const margin = t.revenue > 0 ? Math.round((t.profit / t.revenue) * 100) : null;
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCard
        label="Revenue"
        money={t.revenue}
        tone="accent"
        delta={plural(t.cardsSold, "card") + " sold"}
      />
      <StatCard
        label="Profit"
        value={<MoneyDisplay amount={t.profit} showSign />}
        delta={margin != null ? `${margin}% margin` : "No sales yet"}
      />
      <StatCard
        label="Transactions"
        value={t.deals}
        delta={t.deals === 0 ? "Nothing recorded yet" : plural(t.deals, "deal")}
      />
      <StatCard
        label="Spent"
        value={<MoneyDisplay amount={-t.spent} tone={t.spent > 0 ? "negative" : "neutral"} showSign={t.spent > 0} />}
        delta={plural(t.cardsBought, "card") + " bought"}
      />
    </div>
  );
}

export function TodayStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}

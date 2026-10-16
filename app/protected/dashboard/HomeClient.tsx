"use client";

import { useMemo, useState } from "react";
import { TrendChart } from "@/components/charts/TrendChart";
import { CountStat, CountStatRow, EmptyState, HeroValue, RangePicker, SegmentedControl } from "@/components/ui";
import {
  HOME_RANGES, cumulative, filterByRange, sum,
  type HomeRange, type ProfitPoint, type SnapshotPoint,
} from "./home";
import type { Category } from "./totals";

// ── Home header ──
// Value | Profit segmented control, hero number, trend chart, range picker and
// the Raw | Graded | Sealed counts. Server passes the full series; this only
// filters by range and sums, so no money math lives on the client.

type Mode = "value" | "profit";
const MODES = [{ value: "value", label: "Value" }, { value: "profit", label: "Profit" }] as const;

type Props = {
  inStockValue: number;
  snapshots: SnapshotPoint[];
  profitPoints: ProfitPoint[];
  counts: Record<Category, number>;
};

export default function HomeClient({ inStockValue, snapshots, profitPoints, counts }: Props) {
  const [mode, setMode] = useState<Mode>("value");
  const [range, setRange] = useState<HomeRange>("1M");

  const valueSeries = useMemo(
    () => filterByRange(snapshots, range).map((s) => ({ date: s.date, value: s.total_fmv })),
    [snapshots, range],
  );
  const profitInRange = useMemo(() => filterByRange(profitPoints, range), [profitPoints, range]);
  const profitSeries = useMemo(() => cumulative(profitInRange), [profitInRange]);
  const profitTotal = sum(profitInRange);

  const isValue = mode === "value";
  const series = isValue ? valueSeries : profitSeries;
  const tone = isValue ? "accent" : profitTotal >= 0 ? "up" : "down";

  return (
    <section className="space-y-4">
      <SegmentedControl value={mode} onChange={setMode} options={MODES} aria-label="Value or profit" />

      <HeroValue
        amount={isValue ? inStockValue : profitTotal}
        label={isValue ? "Inventory value" : `Realized profit · ${range}`}
      />

      {series.length >= 2 ? (
        <TrendChart data={series} tone={tone} />
      ) : (
        <EmptyState
          title={isValue ? "Building your chart" : "No sales in this range"}
          hint={isValue ? "Value is captured daily after the price refresh." : "Widen the range or record a sale."}
          className="py-8"
        />
      )}

      <RangePicker value={range} onChange={setRange} ranges={HOME_RANGES} />

      <CountStatRow>
        <CountStat label="Raw" value={counts.single} />
        <CountStat label="Graded" value={counts.slab} />
        <CountStat label="Sealed" value={counts.sealed} />
      </CountStatRow>
    </section>
  );
}

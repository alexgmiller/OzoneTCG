"use client";

import { useMemo, useState } from "react";
import { TrendChart } from "@/components/charts/TrendChart";
import { CountStat, CountStatRow, EmptyState, HeroValue, RangePicker, SegmentedControl } from "@/components/ui";
import {
  HOME_RANGES, cumulative, filterByRange, sum,
  type HomeRange, type ProfitPoint, type ValuePoint,
} from "./home";
import type { Category } from "./totals";

// ── Home header ──
// Value | Profit segmented control, hero number, trend chart, range picker and
// the Raw | Graded | Sealed counts. Server passes the full series; this only
// filters by range and sums, so no money math lives on the client.
// Desktop puts the control and the range picker on one row above a taller chart.

type Mode = "value" | "profit";
const MODES = [{ value: "value", label: "Value" }, { value: "profit", label: "Profit" }] as const;

type Props = {
  inStockValue: number;
  valueSeries: ValuePoint[];
  profitPoints: ProfitPoint[];
  counts: Record<Category, number>;
};

export default function HomeClient({ inStockValue, valueSeries, profitPoints, counts }: Props) {
  const [mode, setMode] = useState<Mode>("value");
  const [range, setRange] = useState<HomeRange>("1M");

  const valueInRange = useMemo(() => filterByRange(valueSeries, range), [valueSeries, range]);
  const profitInRange = useMemo(() => filterByRange(profitPoints, range), [profitPoints, range]);
  const profitSeries = useMemo(() => cumulative(profitInRange), [profitInRange]);
  const profitTotal = sum(profitInRange);

  const isValue = mode === "value";
  const series = isValue ? valueInRange : profitSeries;
  const tone = isValue ? "accent" : profitTotal >= 0 ? "up" : "down";
  const hasChart = series.length >= 2 && (!isValue || series.some((p) => p.value > 0));
  const estimated = isValue && valueInRange.some((p) => p.estimated);

  const rangePicker = (className: string) => (
    <RangePicker value={range} onChange={setRange} ranges={HOME_RANGES} className={className} />
  );

  return (
    <section className="space-y-4">
      <div className="lg:flex lg:items-center lg:justify-between lg:gap-4">
        <SegmentedControl value={mode} onChange={setMode} options={MODES} aria-label="Value or profit" className="lg:w-64" />
        {rangePicker("hidden lg:flex lg:gap-1")}
      </div>

      <HeroValue
        amount={isValue ? inStockValue : profitTotal}
        label={isValue ? "Inventory value" : `Realized profit · ${range}`}
      />

      {hasChart ? (
        <div className="space-y-1">
          <TrendChart data={series} tone={tone} className="h-40 lg:h-72" />
          {estimated && (
            <p className="text-xs text-muted-foreground">
              Earlier days are estimated from today&apos;s prices; daily snapshots take over as they build up.
            </p>
          )}
        </div>
      ) : (
        <EmptyState
          title={isValue ? "Building your chart" : "No sales in this range"}
          hint={isValue ? "Add priced items and the value line starts here." : "Widen the range or record a sale."}
          className="py-8"
        />
      )}

      {rangePicker("lg:hidden")}

      <CountStatRow className="lg:border-t lg:border-border lg:pt-4">
        <CountStat label="Raw" value={counts.single} />
        <CountStat label="Graded" value={counts.slab} />
        <CountStat label="Sealed" value={counts.sealed} />
      </CountStatRow>
    </section>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  Legend,
} from "recharts";

export type ChartItem = {
  created_at: string;
  updated_at: string;
  status: "inventory" | "sold";
  cost: number | null;
  market: number | null;
  sold_price: number | null;
  previous_sales: number | null;
};

type Range = "7d" | "30d" | "90d" | "all";

/* ── helpers ── */

function n(v: number | null | undefined): number {
  return typeof v === "number" && isFinite(v) ? v : 0;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday of the ISO week containing dateStr */
function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return toISO(d);
}

/** Bucket key: raw date if daily, Monday if weekly */
function bk(dateStr: string, weeks: boolean): string {
  return weeks ? mondayOf(dateStr) : dateStr;
}

/** Format "YYYY-MM-DD" → "M/D" */
function fmtLabel(dateStr: string): string {
  const p = dateStr.split("-");
  return `${Number(p[1])}/${Number(p[2])}`;
}

/** ISO date N days before today */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISO(d);
}

function getCutoff(range: Range): string | null {
  if (range === "all") return null;
  return daysAgo({ "7d": 7, "30d": 30, "90d": 90 }[range]);
}

/**
 * Generate every bucket key from startDate to today (inclusive).
 * For weekly mode starts on the Monday of startDate.
 */
function genBuckets(startDate: string, weeks: boolean): string[] {
  const buckets: string[] = [];
  const seen = new Set<string>();
  const today = toISO(new Date());
  // Start on Monday when using weeks so all keys align
  const origin = weeks ? mondayOf(startDate) : startDate;
  let d = new Date(origin + "T12:00:00");
  const end = new Date(today + "T12:00:00");
  const step = weeks ? 7 : 1;

  while (d <= end) {
    const key = toISO(d);
    if (!seen.has(key)) {
      seen.add(key);
      buckets.push(key);
    }
    d.setDate(d.getDate() + step);
  }
  return buckets;
}

/* ── tooltip ── */

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { dataKey: string; name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 space-y-1 shadow-lg">
      <div className="font-semibold mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: ${Number(p.value).toFixed(2)}
        </div>
      ))}
    </div>
  );
}

/* ── constants ── */

const RANGES: { label: string; value: Range }[] = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
  { label: "All", value: "all" },
];

const MARGIN = { top: 4, right: 8, left: 4, bottom: 0 };
const TICK = { fontSize: 10 };
const TICK_FMT = (v: number) =>
  v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`;
const CHART_H = 200;

/* ── component ── */

export default function DashboardCharts({ chartItems }: { chartItems: ChartItem[] }) {
  const [rangeRevenue, setRangeRevenue] = useState<Range>("30d");
  const [rangeActivity, setRangeActivity] = useState<Range>("30d");

  /* Chart 1 – Sales Revenue per bucket */
  const salesData = useMemo(() => {
    const cutoff = getCutoff(rangeRevenue);
    const useWeeks = rangeRevenue === "90d" || rangeRevenue === "all";
    const map: Record<string, number> = {};
    for (const it of chartItems) {
      if (it.status !== "sold") continue;
      const date = it.updated_at.slice(0, 10);
      if (cutoff && date < cutoff) continue;
      const k = bk(date, useWeeks);
      map[k] = (map[k] ?? 0) + (n(it.sold_price) || n(it.previous_sales));
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, revenue]) => ({ date: fmtLabel(k), revenue }));
  }, [chartItems, rangeRevenue]);

  /* Chart 2 – Buys vs Sales per bucket */
  const activityData = useMemo(() => {
    const cutoff = getCutoff(rangeActivity);
    const useWeeks = rangeActivity === "90d" || rangeActivity === "all";
    const map: Record<string, { bought: number; sold: number }> = {};
    const ensure = (k: string) => { if (!map[k]) map[k] = { bought: 0, sold: 0 }; };

    // Purchases (all items by created_at)
    for (const it of chartItems) {
      const date = it.created_at.slice(0, 10);
      if (cutoff && date < cutoff) continue;
      const k = bk(date, useWeeks);
      ensure(k);
      map[k].bought += n(it.cost);
    }

    // Sales (sold items by updated_at)
    for (const it of chartItems) {
      if (it.status !== "sold") continue;
      const date = it.updated_at.slice(0, 10);
      if (cutoff && date < cutoff) continue;
      const k = bk(date, useWeeks);
      ensure(k);
      map[k].sold += n(it.sold_price) || n(it.previous_sales);
    }

    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ date: fmtLabel(k), bought: v.bought, sold: v.sold }));
  }, [chartItems, rangeActivity]);

  /* Chart 3 – Running Portfolio Market Value + Cost Basis (always full history) */
  const { marketData, marketWeeks } = useMemo(() => {
    const events: { date: string; mDelta: number; cDelta: number }[] = [];
    for (const it of chartItems) {
      const m = n(it.market);
      const c = n(it.cost);
      events.push({ date: it.created_at.slice(0, 10), mDelta: m, cDelta: c });
      if (it.status === "sold") {
        events.push({ date: it.updated_at.slice(0, 10), mDelta: -m, cDelta: -c });
      }
    }
    if (!events.length) return { marketData: [], marketWeeks: false };

    const earliest = events.map((e) => e.date).sort()[0];
    const today = toISO(new Date());
    const span = Math.round(
      (new Date(today).getTime() - new Date(earliest).getTime()) / 86400000
    );
    const mWeeks = span > 60;

    // Build delta maps
    const mDeltaMap: Record<string, number> = {};
    const cDeltaMap: Record<string, number> = {};
    for (const e of events) {
      const k = bk(e.date, mWeeks);
      mDeltaMap[k] = (mDeltaMap[k] ?? 0) + e.mDelta;
      cDeltaMap[k] = (cDeltaMap[k] ?? 0) + e.cDelta;
    }

    // Generate complete date series and compute running totals
    const buckets = genBuckets(earliest, mWeeks);
    let runningMarket = 0;
    let runningCost = 0;
    const data = buckets.map((k) => {
      runningMarket += mDeltaMap[k] ?? 0;
      runningCost += cDeltaMap[k] ?? 0;
      return {
        date: fmtLabel(k),
        market: Math.max(0, runningMarket),
        cost: Math.max(0, runningCost),
      };
    });

    return { marketData: data, marketWeeks: mWeeks };
  }, [chartItems]);

  /* Range selector buttons */
  const RangeBar = ({ range, setRange }: { range: Range; setRange: (r: Range) => void }) => (
    <div className="flex gap-1">
      {RANGES.map((r) => (
        <button
          key={r.value}
          onClick={() => setRange(r.value)}
          className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
            range === r.value
              ? "bg-foreground text-background border-foreground"
              : "opacity-50 hover:opacity-75"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );

  const Empty = ({ msg }: { msg: string }) => (
    <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed rounded-lg gap-1.5" style={{ opacity: 0.35 }}>
      <span className="text-xl">◈</span>
      <span className="text-sm font-medium">{msg}</span>
    </div>
  );

  const PortfolioTooltip = ({ active, payload, label }: {
    active?: boolean;
    payload?: { dataKey: string; value: number }[];
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    const market = Number(payload.find((p) => p.dataKey === "market")?.value ?? 0);
    const cost = Number(payload.find((p) => p.dataKey === "cost")?.value ?? 0);
    const unrealized = market - cost;
    return (
      <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 space-y-1 shadow-lg">
        <div className="font-semibold mb-1">{label}</div>
        <div style={{ color: "#8b5cf6" }}>Market: ${market.toFixed(2)}</div>
        <div style={{ color: "#2dd4bf" }}>Cost Basis: ${cost.toFixed(2)}</div>
        <div style={{ color: unrealized >= 0 ? "#22c55e" : "#ef4444" }}>
          Unrealized: {unrealized >= 0 ? "+" : ""}${unrealized.toFixed(2)}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Chart 1: Sales Revenue */}
      <div className="border rounded-xl p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium">Sales Revenue</div>
          <RangeBar range={rangeRevenue} setRange={setRangeRevenue} />
        </div>
        {salesData.length === 0 || salesData.every((d) => d.revenue === 0) ? (
          <Empty msg="No sales in this period" />
        ) : (
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart data={salesData} margin={MARGIN}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
              <XAxis dataKey="date" tick={TICK} />
              <YAxis tick={TICK} tickFormatter={TICK_FMT} width={52} />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="revenue"
                name="Revenue"
                fill="#22c55e"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Chart 2: Buys vs Sales */}
      <div className="border rounded-xl p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium">Buys vs Sales</div>
          <RangeBar range={rangeActivity} setRange={setRangeActivity} />
        </div>
        {activityData.length === 0 ? (
          <Empty msg="No activity in this period" />
        ) : (
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart data={activityData} margin={MARGIN}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
              <XAxis dataKey="date" tick={TICK} />
              <YAxis tick={TICK} tickFormatter={TICK_FMT} width={52} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="bought"
                name="Bought"
                fill="#3b82f6"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
              <Bar
                dataKey="sold"
                name="Sold"
                fill="#22c55e"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Chart 3: Portfolio Market Value + Cost Basis */}
      <div className="border rounded-xl p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium">Portfolio Market Value</div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-xs opacity-60">
              <span className="inline-block w-2 h-2 rounded-full bg-violet-500" />
              Market
            </div>
            <div className="flex items-center gap-1 text-xs opacity-60">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#2dd4bf" }} />
              Cost
            </div>
            <div className="text-xs opacity-40">{marketWeeks ? "Weekly" : "Daily"}</div>
          </div>
        </div>
        {marketData.length === 0 ? (
          <Empty msg="No items yet" />
        ) : (
          <ResponsiveContainer width="100%" height={CHART_H}>
            <AreaChart data={marketData} margin={MARGIN}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
              <XAxis dataKey="date" tick={TICK} />
              <YAxis tick={TICK} tickFormatter={TICK_FMT} width={52} />
              <Tooltip content={<PortfolioTooltip />} />
              <Area
                type="monotone"
                dataKey="cost"
                name="Cost Basis"
                stroke="#2dd4bf"
                fill="#2dd4bf"
                fillOpacity={0.08}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              <Area
                type="monotone"
                dataKey="market"
                name="Market Value"
                stroke="#8b5cf6"
                fill="#8b5cf6"
                fillOpacity={0.15}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

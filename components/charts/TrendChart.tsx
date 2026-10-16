"use client";

import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { cn } from "@/lib/utils";

// ── TrendChart ──
// One series over time: 2px line, faint gradient fill, no axes or gridlines,
// crosshair tooltip. Colour comes from the wrapper's text token via
// currentColor, so callers pass tone and no hex reaches the SVG.
export type TrendPoint = { date: string; value: number };

type Props = {
  data: TrendPoint[];
  tone?: "accent" | "up" | "down";
  height?: number;
  className?: string;
  format?: (v: number) => string;
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function TrendChart({ data, tone = "accent", height = 160, className, format = money.format }: Props) {
  const id = useId();
  const gradient = `trend-${id.replace(/:/g, "")}`;

  return (
    <div
      className={cn(
        tone === "accent" ? "text-accent" : tone === "up" ? "text-up" : "text-down",
        className,
      )}
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            cursor={{ stroke: "currentColor", strokeWidth: 1, strokeOpacity: 0.4 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as TrendPoint;
              return (
                <div className="rounded-xl bg-surface-2 px-3 py-2 text-xs">
                  <div className="text-muted-foreground">{dateFmt.format(new Date(p.date))}</div>
                  <div className="font-semibold tabular-nums text-foreground">{format(p.value)}</div>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="currentColor"
            strokeWidth={2}
            fill={`url(#${gradient})`}
            dot={false}
            activeDot={{ r: 4, stroke: "currentColor", fill: "currentColor" }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

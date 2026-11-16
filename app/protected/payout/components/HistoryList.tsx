"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { MoneyDisplay, SectionHeader } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { PayPeriod } from "../PayoutServer";
import { NET_TONE, fmtDate, netLabel, netSide } from "./payoutMeta";

// ── Settled periods, newest first; tap a row for its breakdown ──

const DETAIL_ROWS: { label: string; key: "alex_paid" | "mila_paid" | "shared_sales" }[] = [
  { label: "Alex's expenses & purchases", key: "alex_paid" },
  { label: "Mila's expenses & purchases", key: "mila_paid" },
  { label: "Shared sales", key: "shared_sales" },
];

function PeriodRow({ period: p }: { period: PayPeriod }) {
  const [open, setOpen] = useState(false);
  const side = netSide(p.net_payout);
  const netAbs = Math.abs(p.net_payout);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-muted"
      >
        <div className="min-w-0">
          <div className="font-mono text-sm tabular-nums text-foreground">
            {fmtDate(p.period_start)} → {fmtDate(p.period_end)}
          </div>
          <div className="text-xs text-muted-foreground">{netLabel(side, "→")}</div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <MoneyDisplay amount={netAbs} tone={NET_TONE[side]} className="text-sm font-semibold" />
          <ChevronDown
            size={16}
            className={cn(
              "text-muted-foreground transition-transform duration-150",
              !open && "-rotate-90",
            )}
          />
        </div>
      </button>

      {open && (
        <div className="divide-y divide-border border-t border-border text-sm">
          {DETAIL_ROWS.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-muted-foreground">{r.label}</span>
              <MoneyDisplay
                amount={p[r.key]}
                tone={r.key === "shared_sales" ? "positive" : "neutral"}
                className={cn("shrink-0", r.key !== "shared_sales" && "text-foreground")}
              />
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 px-4 py-3 font-semibold">
            <span className="text-foreground">{netLabel(side, "paid")}</span>
            <MoneyDisplay amount={netAbs} tone={NET_TONE[side]} className="shrink-0" />
          </div>
          {p.notes && <p className="px-4 py-3 text-xs text-muted-foreground">{p.notes}</p>}
        </div>
      )}
    </div>
  );
}

export function HistoryList({ history }: { history: PayPeriod[] }) {
  if (history.length === 0) return null;

  return (
    <section className="space-y-3">
      <SectionHeader>Past periods</SectionHeader>
      <div className="space-y-2">
        {history.map((p) => (
          <PeriodRow key={p.id} period={p} />
        ))}
      </div>
    </section>
  );
}

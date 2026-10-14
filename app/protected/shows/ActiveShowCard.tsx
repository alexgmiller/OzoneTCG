"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { MoneyDisplay } from "@/components/ui";
import type { ShowSession } from "./actions";
import EndShowPanel from "./EndShowPanel";
import { btnPrimary, btnSecondary, fmtDate, pillCls, showVenue, STATUS_PILL } from "./shared";

// Pinned card for the live show: totals, Open POS, End
export default function ActiveShowCard({ show }: { show: ShowSession }) {
  const [ending, setEnding] = useState(false);
  const venue = showVenue(show);
  const revenue = show.total_revenue ?? 0;
  const spent = show.total_spent ?? 0;
  const cash = (show.starting_cash ?? 0) + revenue - spent;

  return (
    <section className="space-y-4 rounded-xl border border-accent-primary-border bg-accent-primary-soft p-4">
      <Link href={`/protected/shows/${show.id}`} className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-warning" aria-hidden />
            <span className={`${pillCls} ${STATUS_PILL.active.cls}`}>{STATUS_PILL.active.label}</span>
          </div>
          <h2 className="mt-2 truncate text-lg font-semibold text-foreground">{show.name}</h2>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {fmtDate(show.date, true)}
            {venue && ` · ${venue}`}
          </div>
        </div>
        <ChevronRight size={16} className="mt-1 shrink-0 text-muted-foreground" />
      </Link>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Revenue" amount={revenue} tone={revenue > 0 ? "positive" : "neutral"} />
        <Stat label="Spent" amount={spent} tone={spent > 0 ? "negative" : "neutral"} />
        <Stat label="Cash" amount={cash} tone="neutral" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link href="/protected/pos" className={btnPrimary}>Open POS</Link>
        <button type="button" onClick={() => setEnding((v) => !v)} className={btnSecondary}>
          {ending ? "Cancel" : "End show"}
        </button>
      </div>

      {ending && <EndShowPanel showId={show.id} />}
    </section>
  );
}

function Stat({ label, amount, tone }: { label: string; amount: number; tone: "positive" | "negative" | "neutral" }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <MoneyDisplay amount={amount} tone={tone} className="text-base font-semibold" />
    </div>
  );
}

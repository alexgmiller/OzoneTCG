"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { EmptyState, MoneyDisplay, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { startShow, type ShowSession } from "./actions";
import { btnPrimary, fmtDate, pillCls, showVenue, STATUS_PILL, todayLocalISO } from "./shared";

// ── Shows list ──
// Live show pinned on top, then UPCOMING soonest-first, then PAST most-recent-
// first. Each card: name, date, venue, and net P&L in up/down. Tap opens detail.
export default function ShowsList({ shows }: { shows: ShowSession[] }) {
  const active = shows.find((s) => s.status === "active") ?? null;
  const scheduled = shows.filter((s) => s.status === "scheduled").sort((a, b) => a.date.localeCompare(b.date));
  const completed = shows.filter((s) => s.status === "completed").sort((a, b) => b.date.localeCompare(a.date));

  if (shows.length === 0) {
    return (
      <EmptyState
        title="No shows yet"
        hint="Schedule your next card show above, or start one from POS."
        preview={<div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-16 rounded-2xl bg-surface-2" />)}</div>}
      />
    );
  }

  return (
    <div className="space-y-5">
      {active && <ShowCard show={active} live />}

      {scheduled.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-label">Upcoming</h2>
          <div className="space-y-2">
            {scheduled.map((s) => <ShowCard key={s.id} show={s} canStart={!active} />)}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-label">Past</h2>
          <div className="space-y-2">
            {completed.map((s) => <ShowCard key={s.id} show={s} />)}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Show card ──
function ShowCard({ show, live = false, canStart = false }: { show: ShowSession; live?: boolean; canStart?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const venue = showVenue(show);
  const isToday = show.date === todayLocalISO();
  const scheduled = show.status === "scheduled";
  const completed = show.status === "completed";
  const net = show.net_pl ?? 0;

  async function start() {
    setBusy(true);
    try {
      await startShow({ scheduledId: show.id, name: show.name, starting_cash: show.starting_cash, date: todayLocalISO() });
      router.push("/protected/pos");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start show");
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex items-center gap-3 rounded-2xl p-4", live ? "bg-accent-tint" : "bg-surface")}>
      <Link href={live ? "/protected/pos" : `/protected/shows/${show.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {live && <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden />}
            <span className={cn("truncate text-base font-semibold", live ? "text-accent" : "text-foreground")}>{show.name}</span>
            {live && <span className={cn(pillCls, STATUS_PILL.active.cls)}>Live</span>}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <span className={cn("shrink-0 tabular-nums", scheduled && isToday && "font-semibold text-accent")}>
              {scheduled && isToday ? "Today" : fmtDate(show.date, scheduled)}
            </span>
            {venue && <span className="truncate">· {venue}</span>}
          </div>
          {completed && (
            <div className="mt-1 text-xs tabular-nums text-muted-foreground">
              {show.cards_bought ?? 0} bought · {show.cards_sold ?? 0} sold
              {(show.trades_count ?? 0) > 0 && ` · ${show.trades_count} trade${show.trades_count === 1 ? "" : "s"}`}
            </div>
          )}
        </div>

        {(completed || live) && (
          <MoneyDisplay
            amount={live ? (show.total_revenue ?? 0) - (show.total_spent ?? 0) : net}
            showSign
            className={cn("shrink-0 text-base font-bold tabular-nums", net >= 0 ? "text-up" : "text-down")}
          />
        )}
        {!scheduled && <ChevronRight size={18} className="shrink-0 text-muted-foreground" />}
      </Link>

      {scheduled && (
        <button type="button" onClick={start} disabled={busy || !canStart} className={cn(btnPrimary, "shrink-0")}>
          {busy ? "Starting…" : "Start"}
        </button>
      )}
    </div>
  );
}

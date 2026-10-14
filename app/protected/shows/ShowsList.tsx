"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { EmptyState, MoneyDisplay, SectionHeader, useToast } from "@/components/ui";
import { startShow, type ShowSession } from "./actions";
import ActiveShowCard from "./ActiveShowCard";
import { btnPrimary, fmtDate, showVenue, todayLocalISO } from "./shared";

// One list: live show pinned, then upcoming soonest-first, then past most-recent-first
export default function ShowsList({ shows }: { shows: ShowSession[] }) {
  const active = shows.find((s) => s.status === "active") ?? null;
  const scheduled = shows
    .filter((s) => s.status === "scheduled")
    .sort((a, b) => a.date.localeCompare(b.date));
  const completed = shows
    .filter((s) => s.status === "completed")
    .sort((a, b) => b.date.localeCompare(a.date));

  if (shows.length === 0) {
    return (
      <EmptyState
        title="No shows yet"
        hint="Schedule your next card show or start one right now with the button above."
      />
    );
  }

  return (
    <div className="space-y-5">
      {active && <ActiveShowCard show={active} />}

      {scheduled.length > 0 && (
        <section className="space-y-2">
          <SectionHeader>Upcoming</SectionHeader>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {scheduled.map((s) => (
              <ScheduledRow key={s.id} show={s} hasActive={active !== null} />
            ))}
          </ul>
        </section>
      )}

      {completed.length > 0 && (
        <section className="space-y-2">
          <SectionHeader>Past</SectionHeader>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {completed.map((s) => (
              <CompletedRow key={s.id} show={s} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ── Scheduled row ─────────────────────────────────────────────────────────────

function ScheduledRow({ show, hasActive }: { show: ShowSession; hasActive: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const isToday = show.date === todayLocalISO();
  const venue = showVenue(show);

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
    <li className="flex items-center gap-3 p-3">
      <Link
        href={`/protected/shows/${show.id}`}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{show.name}</div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className={isToday ? "font-semibold text-accent-primary" : undefined}>
              {isToday ? "Today" : fmtDate(show.date, true)}
            </span>
            {venue && <span className="truncate">· {venue}</span>}
          </div>
        </div>
        <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
      </Link>
      <button
        type="button"
        onClick={start}
        disabled={busy || hasActive}
        className={`${btnPrimary} shrink-0`}
      >
        {busy ? "Starting…" : "Start"}
      </button>
    </li>
  );
}

// ── Completed row ─────────────────────────────────────────────────────────────

function CompletedRow({ show }: { show: ShowSession }) {
  const venue = showVenue(show);
  const trades = show.trades_count ?? 0;

  return (
    <li>
      <Link
        href={`/protected/shows/${show.id}`}
        className="flex min-h-11 items-center gap-3 p-3 transition-colors duration-150 hover:bg-muted"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{show.name}</div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
            {fmtDate(show.date)}
            {venue && ` · ${venue}`}
          </div>
          <div className="mt-1 text-xs text-muted-foreground tabular-nums">
            {show.cards_bought ?? 0} bought · {show.cards_sold ?? 0} sold
            {trades > 0 && ` · ${trades} trade${trades === 1 ? "" : "s"}`}
          </div>
        </div>
        <MoneyDisplay
          amount={show.net_pl ?? 0}
          showSign
          className="shrink-0 text-base font-semibold"
        />
        <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

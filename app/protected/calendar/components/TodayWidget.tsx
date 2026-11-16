"use client";

import Link from "next/link";
import { Zap } from "lucide-react";
import { MoneyDisplay, SectionHeader } from "@/components/ui";
import type { DayActivity } from "../actions";
import { KIND_TEXT, fmtShortDate } from "./helpers";

// ── Today widget ──────────────────────────────────────────────────────────────

export function TodayWidget({
  todayStr, activity, onOpen,
}: {
  todayStr: string;
  activity?: DayActivity;
  onOpen: () => void;
}) {
  const buys = activity?.buyCount ?? 0;
  const sells = activity?.sellCount ?? 0;
  const trades = activity?.tradeCount ?? 0;
  const net = activity?.netPL ?? 0;
  const activeShow = (activity?.shows ?? []).find((s) => s.status === "active");
  const hasCounts = buys > 0 || sells > 0 || trades > 0;

  const counts: [number, string, string][] = [
    [buys, "buy", KIND_TEXT.buy],
    [sells, "sell", KIND_TEXT.sell],
    [trades, "trade", KIND_TEXT.trade],
  ];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="w-full cursor-pointer rounded-xl border border-border bg-card p-4 text-left transition-colors duration-150 hover:bg-muted"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <SectionHeader>Today · {fmtShortDate(todayStr)}</SectionHeader>

          {activeShow && (
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-warning" />
              <span className="truncate text-sm font-semibold text-warning">{activeShow.name}</span>
            </div>
          )}

          {hasCounts ? (
            <div className="flex flex-wrap items-center gap-3 tabular-nums">
              {counts.map(([n, word, cls]) =>
                n > 0 ? (
                  <span key={word} className={`text-sm font-medium ${cls}`}>
                    {n} {word}{n !== 1 ? "s" : ""}
                  </span>
                ) : null,
              )}
            </div>
          ) : (
            !activeShow && <span className="text-sm text-muted-foreground">No activity yet</span>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {net !== 0 && (
            <MoneyDisplay amount={net} showSign className="text-lg font-semibold leading-none" />
          )}
          {activeShow && (
            <Link
              href="/protected/pos"
              onClick={(e) => e.stopPropagation()}
              className="flex h-11 items-center gap-1.5 whitespace-nowrap rounded-lg border border-warning-border bg-card px-4 text-sm font-semibold text-warning transition-colors duration-150 hover:bg-warning-soft"
            >
              <Zap size={14} />
              Go to Show
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

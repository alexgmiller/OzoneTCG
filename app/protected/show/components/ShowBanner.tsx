"use client";

import React from "react";
import type { ShowSession } from "../actions";
import { getPendingActions, type PendingAction } from "@/lib/offlineQueue";
import { money, moneyCash, moneySign, fmtDate } from "../utils";

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  session: ShowSession;
  isOffline: boolean;
  pendingCount: number;
  expectedCash: number;
  statsExpanded: boolean;
  setStatsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setExpenseOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setEndOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setEndStep: React.Dispatch<React.SetStateAction<"preview" | "finalize">>;
  setCashCountInput: React.Dispatch<React.SetStateAction<string>>;
  setCashCountOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingModalActions: React.Dispatch<React.SetStateAction<PendingAction[]>>;
  setPendingModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ShowBanner({
  session,
  isOffline,
  pendingCount,
  expectedCash,
  statsExpanded,
  setStatsExpanded,
  setExpenseOpen,
  setEndOpen,
  setEndStep,
  setCashCountInput,
  setCashCountOpen,
  setPendingModalActions,
  setPendingModalOpen,
}: Props) {
  return (
    <div
      className="sticky top-14 z-30 px-4 pt-2 pb-1.5 border-b"
      style={{ background: "var(--bg-glass, rgba(13,11,20,0.92))", backdropFilter: "blur(12px)" }}
    >
      {/* Show name row */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-start gap-2 min-w-0">
          <div
            className="text-xs font-bold tracking-widest uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5"
            style={{ background: "rgba(234,179,8,0.15)", color: "#eab308" }}
          >
            SHOW
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <div className="text-sm font-semibold truncate">{session.name}</div>
              {isOffline && (
                <span className="shrink-0 w-2 h-2 rounded-full bg-red-500" title="Offline" />
              )}
              {pendingCount > 0 && (
                <button
                  onClick={async () => {
                    const actions = await getPendingActions().catch(() => []);
                    setPendingModalActions(actions);
                    setPendingModalOpen(true);
                  }}
                  className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ background: "rgba(234,179,8,0.2)", color: "#eab308" }}
                >
                  {pendingCount} pending
                </button>
              )}
            </div>
            <div className="text-[10px] opacity-40 leading-tight">{fmtDate(session.date)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setExpenseOpen(true)}
            className="text-xs px-2 py-1 rounded-lg border opacity-50 hover:opacity-80 transition-opacity"
          >
            + Expense
          </button>
          <button
            onClick={() => { setEndOpen(true); setEndStep("preview"); }}
            className="text-xs px-2 py-1 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
          >
            End
          </button>
        </div>
      </div>

      {/* Primary stats row — always visible */}
      <div className="grid grid-cols-3 gap-2 pb-0.5">
        {/* Cash — tappable */}
        <div
          className="rounded-xl px-3 py-2 cursor-pointer"
          style={{ background: "rgba(255,255,255,0.05)" }}
          onClick={() => { setCashCountInput(""); setCashCountOpen(true); }}
          title="Tap to count cash"
        >
          <div className="text-[9px] uppercase tracking-wide opacity-40 mb-1">Cash</div>
          <div className={`text-base font-bold tabular-nums leading-none underline decoration-dotted underline-offset-2 ${expectedCash < 0 ? "text-rose-400" : ""}`}>
            {moneyCash(expectedCash)}
          </div>
        </div>
        {/* P&L */}
        <div
          className="rounded-xl px-3 py-2"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          <div className="text-[9px] uppercase tracking-wide opacity-40 mb-1">P&L</div>
          <div className={`text-base font-bold tabular-nums leading-none ${session.net_pl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {moneySign(session.net_pl)}
          </div>
        </div>
        {/* Cards in / out */}
        <div
          className="rounded-xl px-3 py-2"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          <div className="text-[9px] uppercase tracking-wide opacity-40 mb-1">Cards</div>
          <div className="text-[11px] font-bold tabular-nums leading-none flex items-baseline gap-1.5">
            <span className="text-emerald-400">{session.cards_bought}<span className="font-normal opacity-60 ml-0.5">in</span></span>
            <span className="opacity-20">·</span>
            <span>{session.cards_sold}<span className="font-normal opacity-60 ml-0.5">out</span></span>
          </div>
        </div>
      </div>

      {/* Expandable more stats */}
      <button
        onClick={() => setStatsExpanded((e) => !e)}
        className="w-full text-[9px] uppercase tracking-wide opacity-30 hover:opacity-50 transition-opacity pt-1.5 pb-0"
      >
        {statsExpanded ? "▲ Less" : "▼ More stats"}
      </button>
      {statsExpanded && (
        <div className="border-t mt-1.5 pt-2 pb-0.5">
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: "Spent",   value: money(session.total_spent),    color: "text-rose-400" },
              { label: "Revenue", value: money(session.total_revenue),  color: "text-emerald-400" },
              { label: "Trades",  value: String(session.trades_count),  color: "" },
              { label: "Passed",  value: String(session.passes_count),  color: "" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl px-2 py-1.5 text-center"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                <div className="text-[9px] uppercase tracking-wide opacity-40 mb-0.5">{stat.label}</div>
                <div className={`text-xs font-bold tabular-nums ${stat.color}`}>{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

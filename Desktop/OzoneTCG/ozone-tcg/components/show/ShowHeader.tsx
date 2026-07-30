"use client";

import { ChevronDown, CloudOff } from "lucide-react";
import { Skeleton } from "@/components/ui";
import type { ShowSession } from "@/app/protected/show/actions";

// ── Helpers ───────────────────────────────────────────────────────────────────

function money(v: number | null) {
  if (v == null) return "—";
  return `$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function moneyCash(v: number | null) {
  if (v == null) return "—";
  const abs = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `-$${abs}` : `$${abs}`;
}

function moneySign(v: number) {
  return (v >= 0 ? "+" : "−") + `$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  session: ShowSession;
  expectedCash: number;
  pendingCount: number;
  isOffline: boolean;
  statsExpanded: boolean;
  onCashTap: () => void;
  onExpenseOpen: () => void;
  onEndOpen: () => void;
  onPendingTap: () => void;
  onStatsToggle: () => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ShowHeader({
  session,
  expectedCash,
  pendingCount,
  isOffline,
  statsExpanded,
  onCashTap,
  onExpenseOpen,
  onEndOpen,
  onPendingTap,
  onStatsToggle,
}: Props) {
  const pl = session.net_pl;
  const plPositive = pl >= 0;

  return (
    <div
      className="sticky top-14 z-30 px-4 pt-3 pb-3 border-b overflow-hidden"
      style={{
        background: `
          radial-gradient(120% 80% at 80% -30%, rgba(139,92,246,0.14), transparent 60%),
          radial-gradient(90% 60% at 0% 100%, rgba(234,179,8,0.06), transparent 55%),
          linear-gradient(180deg, rgba(18,14,30,0.92), rgba(13,11,20,0.92))
        `,
        backdropFilter: "blur(14px) saturate(160%)",
        WebkitBackdropFilter: "blur(14px) saturate(160%)",
        borderColor: "rgba(139,92,246,0.18)",
      }}
    >
      {/* subtle grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
          maskImage: "radial-gradient(120% 80% at 80% 0%, black 0%, transparent 70%)",
        }}
      />

      {/* top meta row */}
      <div className="relative flex items-center gap-2 mb-2.5">
        {/* Live dot badge */}
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-full shrink-0"
          style={{
            background: "rgba(234,179,8,0.10)",
            border: "1px solid rgba(234,179,8,0.28)",
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{
              background: "#eab308",
              boxShadow: "0 0 8px rgba(234,179,8,0.85)",
              animation: "pulse 1.8s ease-in-out infinite",
            }}
          />
          <span
            className="text-[10px] font-bold tracking-[0.14em] uppercase font-mono"
            style={{ color: "#eab308" }}
          >
            Live
          </span>
        </div>

        {/* Show name */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate leading-tight" style={{ letterSpacing: -0.1 }}>
            {session.name}
          </div>
        </div>

        {/* Action chips */}
        <div className="flex items-center gap-1.5 shrink-0">
          {(isOffline || pendingCount > 0) && (
            <button
              onClick={pendingCount > 0 ? onPendingTap : undefined}
              className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors"
              style={isOffline ? {
                background: "rgba(148,163,184,0.12)",
                border: "1px solid rgba(148,163,184,0.28)",
                color: "#94a3b8",
                cursor: pendingCount > 0 ? "pointer" : "default",
              } : {
                background: "rgba(245,158,11,0.15)",
                border: "1px solid rgba(245,158,11,0.35)",
                color: "#fbbf24",
              }}
            >
              {isOffline ? (
                <>
                  <span
                    style={{
                      width: 5, height: 5, borderRadius: 999,
                      background: "#94a3b8",
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  {pendingCount > 0 ? `Offline · ${pendingCount}` : "Offline"}
                </>
              ) : (
                <>
                  <CloudOff size={11} />
                  {pendingCount}
                </>
              )}
            </button>
          )}
          <button
            onClick={onExpenseOpen}
            className="text-[11px] font-semibold px-2 py-1 rounded-lg transition-opacity"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(226,232,240,0.80)",
            }}
          >
            ＋
          </button>
          <button
            onClick={onEndOpen}
            className="text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors"
            style={{
              background: "rgba(244,63,94,0.06)",
              border: "1px solid rgba(244,63,94,0.26)",
              color: "#fb7185",
            }}
          >
            End
          </button>
        </div>
      </div>

      {/* hero grid */}
      <div className="relative grid gap-2.5" style={{ gridTemplateColumns: "1.25fr 1fr" }}>
        {/* Cash tile — tappable */}
        <button
          onClick={onCashTap}
          className="relative text-left rounded-xl overflow-hidden active:scale-[0.97] transition-transform"
          style={{
            border: "1px solid rgba(255,255,255,0.06)",
            background: "linear-gradient(180deg, rgba(36,30,53,0.55), rgba(22,18,34,0.55))",
            padding: "10px 12px 11px",
            boxShadow: "0 6px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          {/* warm glow */}
          <div
            className="absolute -top-5 -right-5 w-20 h-20 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(234,179,8,0.18), transparent 65%)" }}
          />
          <div
            className="text-[9px] font-bold tracking-[0.16em] uppercase mb-1.5 flex items-center gap-1.5"
            style={{ color: "rgba(234,179,8,0.75)" }}
          >
            <span>◆</span> Expected cash
          </div>
          <div
            className={`text-3xl font-bold tabular-nums leading-none ${expectedCash < 0 ? "text-rose-400" : ""}`}
            style={{ letterSpacing: -1, fontFeatureSettings: '"tnum"' }}
          >
            {moneyCash(expectedCash)}
          </div>
          <div
            className="text-[10px] mt-1.5 flex items-center gap-1"
            style={{ color: "rgba(148,163,184,0.7)", fontFeatureSettings: '"tnum"', letterSpacing: 0.2 }}
          >
            <span style={{ color: "#c4b5fd" }}>↳</span> tap to count drawer
          </div>
        </button>

        {/* P&L tile */}
        <div
          className="relative rounded-xl overflow-hidden"
          style={{
            border: "1px solid rgba(255,255,255,0.06)",
            background: "linear-gradient(180deg, rgba(36,30,53,0.55), rgba(22,18,34,0.55))",
            padding: "10px 12px 11px",
            boxShadow: "0 6px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          <div
            className="text-[9px] font-bold tracking-[0.16em] uppercase mb-1.5"
            style={{ color: plPositive ? "rgba(52,211,153,0.8)" : "rgba(251,113,133,0.8)" }}
          >
            Net P&amp;L
          </div>
          <div
            className="text-2xl font-bold tabular-nums leading-none"
            style={{
              letterSpacing: -0.7,
              fontFeatureSettings: '"tnum"',
              color: plPositive ? "#34d399" : "#fb7185",
              textShadow: plPositive
                ? "0 0 20px rgba(52,211,153,0.35)"
                : "0 0 20px rgba(244,63,94,0.35)",
            }}
          >
            {moneySign(pl)}
          </div>
          <div className="text-[10px] mt-1.5" style={{ color: "rgba(148,163,184,0.55)", letterSpacing: 0.1 }}>
            {fmtDate(session.date)}
          </div>
        </div>
      </div>

      {/* stat strip */}
      <div
        className="relative flex items-center justify-between mt-2.5 pt-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        {[
          { label: "Bought",  val: String(session.cards_bought),   color: "#e2e8f0" },
          { label: "Sold",    val: String(session.cards_sold),      color: "#e2e8f0" },
          { label: "Traded",  val: String(session.trades_count),    color: "#c4b5fd" },
          { label: "Spent",   val: money(session.total_spent),      color: "#fb7185" },
          { label: "Revenue", val: money(session.total_revenue),    color: "#34d399" },
        ].map((s, i) => (
          <div
            key={s.label}
            className="flex-1 text-center"
            style={{ borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}
          >
            <div
              className="text-xs font-bold tabular-nums leading-none"
              style={{ letterSpacing: -0.2, fontFeatureSettings: '"tnum"', color: s.color }}
            >
              {s.val}
            </div>
            <div
              className="text-[8.5px] font-semibold uppercase tracking-[0.14em] mt-0.5"
              style={{ color: "rgba(100,116,139,0.9)" }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* More stats toggle */}
      <button
        onClick={onStatsToggle}
        className="w-full flex items-center justify-center gap-1 text-[10px] uppercase tracking-widest opacity-30 hover:opacity-50 transition-opacity pt-1.5 pb-0"
      >
        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${statsExpanded ? "rotate-180" : ""}`} />
        {statsExpanded ? "less" : "more"}
      </button>

      {statsExpanded && (
        <div className="border-t mt-1.5 pt-2 pb-0.5" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: "Spent",   value: money(session.total_spent),           color: "text-rose-400" },
              { label: "Revenue", value: money(session.total_revenue),         color: "text-emerald-400" },
              { label: "Trades",  value: String(session.trades_count),         color: "" },
              { label: "Passed",  value: String(session.passes_count),         color: "" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl px-2 py-1.5 text-center"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                <div className="text-[10px] uppercase tracking-widest opacity-40 mb-0.5">{stat.label}</div>
                <div className={`text-xs font-bold tabular-nums ${stat.color}`}>{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

export function ShowHeaderSkeleton() {
  return (
    <div
      className="sticky top-14 z-30 px-4 pt-3 pb-3 border-b"
      style={{
        background: "linear-gradient(180deg, rgba(18,14,30,0.92), rgba(13,11,20,0.92))",
        borderColor: "rgba(139,92,246,0.18)",
      }}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton variant="text" className="w-40" />
        <div className="flex gap-1.5 ml-auto">
          <Skeleton className="h-6 w-8 rounded-lg" />
          <Skeleton className="h-6 w-10 rounded-lg" />
        </div>
      </div>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: "1.25fr 1fr" }}>
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <div className="flex justify-between mt-2.5 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <Skeleton variant="text" className="w-8" />
            <Skeleton variant="text" className="w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}

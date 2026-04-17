"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import { ChevronLeft, ChevronRight, Plus, X, Loader2, Zap, ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  getCalendarMonthData,
  getDayDetail,
  scheduleShow,
  type DayActivity,
  type DayDetail,
  type BuyEntry,
  type SellEntry,
  type TradeEntry,
  type ExpenseEntry,
  type ShowEntry,
} from "./actions";

// ── Constants & helpers ───────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_ABBREVS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// Color tokens matching --accent-* in globals.css
const C = {
  buy:   "#f43f5e",  // --accent-red
  sell:  "#34d399",  // --accent-green
  trade: "#8b5cf6",  // --accent-primary
  show:  "#eab308",  // --accent-gold
  exp:   "#94a3b8",  // text-secondary
} as const;

function fmt$(n: number) {
  return (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
}
function fmtShort$(n: number) {
  const abs = Math.abs(n);
  const prefix = n < 0 ? "-$" : "$";
  if (abs >= 1000) return prefix + (abs / 1000).toFixed(1) + "k";
  return prefix + abs.toFixed(0);
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function fmtLongDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
function fmtShortDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString([], { month: "long", day: "numeric" });
}
function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function getSundayOfWeek(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() - d.getDay()); // go to Sunday
  return d.toISOString().slice(0, 10);
}
function isFuture(dateStr: string, todayStr: string) {
  return dateStr > todayStr;
}
function truncateName(name: string, maxLen: number) {
  return name.length > maxLen ? name.slice(0, maxLen - 1) + "…" : name;
}

// ── Dot row ───────────────────────────────────────────────────────────────────

function DotRow({ hasBuys, hasSells, hasTrades, hasShows, hasExpenses }: {
  hasBuys: boolean; hasSells: boolean; hasTrades: boolean;
  hasShows: boolean; hasExpenses: boolean;
}) {
  if (!hasBuys && !hasSells && !hasTrades && !hasShows && !hasExpenses) return null;
  return (
    <div className="flex items-center gap-[3px]">
      {hasBuys    && <span className="w-[5px] h-[5px] rounded-full" style={{ background: C.buy }} />}
      {hasSells   && <span className="w-[5px] h-[5px] rounded-full" style={{ background: C.sell }} />}
      {hasTrades  && <span className="w-[5px] h-[5px] rounded-full" style={{ background: C.trade }} />}
      {hasShows   && <span className="w-[5px] h-[5px] rounded-full" style={{ background: C.show }} />}
      {hasExpenses && <span className="w-[5px] h-[5px] rounded-full" style={{ background: C.exp }} />}
    </div>
  );
}

// ── Month grid cell ───────────────────────────────────────────────────────────

function DayCell({
  dateStr, day, isToday, isSelected, isCurrentMonth, activity, onClick,
}: {
  dateStr: string; day: number; isToday: boolean; isSelected: boolean;
  isCurrentMonth: boolean; activity?: DayActivity; onClick: () => void;
}) {
  const hasBuys    = (activity?.buyCount ?? 0) > 0;
  const hasSells   = (activity?.sellCount ?? 0) > 0;
  const hasTrades  = (activity?.tradeCount ?? 0) > 0;
  const hasShows   = (activity?.shows ?? []).length > 0;
  const hasExpenses = (activity?.expenseCount ?? 0) > 0;
  const pl = activity?.netPL ?? 0;
  const showName = hasShows ? activity!.shows[0].name : null;

  return (
    <button
      onClick={onClick}
      className={[
        "relative flex flex-col items-start px-1 pt-1 pb-1.5 rounded-lg transition-all select-none min-h-[72px] gap-0.5 text-left w-full",
        isSelected
          ? "ring-1 ring-[#8b5cf6]/50"
          : "hover:bg-white/[0.04]",
        !isCurrentMonth ? "opacity-25" : "",
        isToday
          ? "bg-[#8b5cf6]/10"
          : isSelected
            ? "bg-[#8b5cf6]/10"
            : hasShows
              ? "bg-[#eab308]/[0.06]"
              : "",
        hasShows ? "border border-[#eab308]/20" : "border border-transparent",
      ].join(" ")}
    >
      {/* Day number */}
      <span
        className={[
          "text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full leading-none shrink-0",
          isToday
            ? "bg-[#8b5cf6] text-white"
            : "text-foreground/70",
        ].join(" ")}
      >
        {day}
      </span>

      {/* Show name */}
      {showName && (
        <span
          className="text-[9px] leading-tight font-medium w-full truncate"
          style={{ color: C.show }}
        >
          {truncateName(showName, 10)}
        </span>
      )}

      {/* Spacer pushes dots to bottom */}
      <div className="flex-1" />

      {/* Activity dots + P&L */}
      <div className="w-full flex items-end justify-between gap-1">
        <DotRow hasBuys={hasBuys} hasSells={hasSells} hasTrades={hasTrades} hasShows={false} hasExpenses={hasExpenses} />
        {pl !== 0 && (
          <span
            className="text-[8px] leading-none font-semibold shrink-0"
            style={{ color: pl > 0 ? C.sell : C.buy }}
          >
            {fmtShort$(pl)}
          </span>
        )}
      </div>
    </button>
  );
}

// ── Week strip cell ───────────────────────────────────────────────────────────

function WeekCell({
  dateStr, isToday, isSelected, activity, onClick,
}: {
  dateStr: string; isToday: boolean; isSelected: boolean;
  activity?: DayActivity; onClick: () => void;
}) {
  const d = new Date(dateStr + "T12:00:00");
  const dayAbbrev = DAY_ABBREVS[d.getDay()];
  const dayNum = d.getDate();
  const hasBuys    = (activity?.buyCount ?? 0) > 0;
  const hasSells   = (activity?.sellCount ?? 0) > 0;
  const hasTrades  = (activity?.tradeCount ?? 0) > 0;
  const hasShows   = (activity?.shows ?? []).length > 0;
  const hasExpenses = (activity?.expenseCount ?? 0) > 0;
  const showName = hasShows ? activity!.shows[0].name : null;

  return (
    <button
      onClick={onClick}
      className={[
        "flex-1 flex flex-col items-center py-2 px-0.5 rounded-xl transition-all gap-0.5",
        isSelected
          ? "bg-[#8b5cf6]/15 ring-1 ring-[#8b5cf6]/40"
          : "hover:bg-white/[0.05]",
        isToday && !isSelected ? "bg-[#8b5cf6]/8" : "",
        hasShows && !isSelected ? "border border-[#eab308]/25" : "border border-transparent",
      ].join(" ")}
    >
      {/* Day abbrev */}
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        {dayAbbrev}
      </span>

      {/* Day number */}
      <span
        className={[
          "text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full",
          isToday ? "bg-[#8b5cf6] text-white" : "",
        ].join(" ")}
      >
        {dayNum}
      </span>

      {/* Show name (truncated) */}
      {showName ? (
        <span className="text-[9px] leading-tight truncate max-w-full font-medium" style={{ color: C.show }}>
          {truncateName(showName, 7)}
        </span>
      ) : (
        <span className="text-[9px] invisible">·</span>
      )}

      {/* Activity dots */}
      <DotRow hasBuys={hasBuys} hasSells={hasSells} hasTrades={hasTrades} hasShows={false} hasExpenses={hasExpenses} />
    </button>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {([
        ["Buy",   C.buy],
        ["Sell",  C.sell],
        ["Trade", C.trade],
        ["Show",  C.show],
      ] as [string, string][]).map(([label, color]) => (
        <span key={label} className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    scheduled: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    active:    "bg-amber-500/15 text-amber-400 border-amber-500/20",
    completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide ${styles[status] ?? "bg-white/8 text-white/50 border-white/10"}`}>
      {status}
    </span>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label, color, count }: { label: string; color: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="text-[10px] text-muted-foreground/60 font-medium">{count}</span>
    </div>
  );
}

// ── Day detail panel ──────────────────────────────────────────────────────────

function DayDetailPanel({
  detail, dateStr, todayStr, onScheduleShow, onClose, setLightboxUrl,
}: {
  detail: DayDetail | null;
  dateStr: string;
  todayStr: string;
  onScheduleShow: () => void;
  onClose: () => void;
  setLightboxUrl: (url: string | null) => void;
}) {
  if (!detail) return null;

  const { buys, sells, trades, expenses, shows } = detail;
  const hasAnything = buys.length + sells.length + trades.length + expenses.length + shows.length > 0;
  const isFutureDay = isFuture(dateStr, todayStr);
  const isToday = dateStr === todayStr;

  const cashIn  = sells.reduce((s, x) => s + (x.sold_price ?? 0), 0);
  const cashOut = buys.reduce((s, x) => s + (x.cost ?? 0), 0)
                + expenses.reduce((s, x) => s + (x.cost ?? 0), 0);
  const netPL   = cashIn - cashOut;

  return (
    <div
      className="mt-4 rounded-2xl overflow-hidden border"
      style={{ borderColor: "var(--border-subtle)", background: "var(--bg-elevated)" }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-start justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--border-subtle)", background: "rgba(255,255,255,0.02)" }}
      >
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
            {isToday ? "Today" : isFutureDay ? "Upcoming" : ""}
          </div>
          <h3 className="text-sm font-semibold text-foreground">{fmtLongDate(dateStr)}</h3>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {(isFutureDay || isToday) && (
            <button
              onClick={onScheduleShow}
              className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors"
              style={{ color: "var(--accent-primary)", background: "rgba(139,92,246,0.10)" }}
            >
              <Plus size={11} />
              Schedule Show
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/8 transition-colors text-muted-foreground"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* ── Summary bar ── */}
      {hasAnything && (
        <div className="flex divide-x text-center" style={{ borderColor: "var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {buys.length > 0 && (
            <div className="flex-1 py-2.5">
              <div className="text-xs font-bold" style={{ color: C.buy }}>{buys.length}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Buys</div>
            </div>
          )}
          {sells.length > 0 && (
            <div className="flex-1 py-2.5">
              <div className="text-xs font-bold" style={{ color: C.sell }}>{sells.length}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Sells</div>
            </div>
          )}
          {trades.length > 0 && (
            <div className="flex-1 py-2.5">
              <div className="text-xs font-bold" style={{ color: C.trade }}>{trades.length}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Trades</div>
            </div>
          )}
          {expenses.length > 0 && (
            <div className="flex-1 py-2.5">
              <div className="text-xs font-bold text-muted-foreground">{expenses.length}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Expenses</div>
            </div>
          )}
          {(cashIn > 0 || cashOut > 0) && (
            <div className="flex-1 py-2.5">
              <div className="text-xs font-bold" style={{ color: netPL >= 0 ? C.sell : C.buy }}>{fmt$(netPL)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Net P&L</div>
            </div>
          )}
        </div>
      )}

      <div className="p-4 space-y-5 max-h-[55vh] overflow-y-auto">
        {/* Empty state */}
        {!hasAnything && (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">
              {isFutureDay ? "No shows scheduled yet." : "No activity recorded."}
            </p>
            {isFutureDay && (
              <button
                onClick={onScheduleShow}
                className="mt-3 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: "var(--accent-primary)", background: "rgba(139,92,246,0.10)" }}
              >
                + Schedule a Show
              </button>
            )}
          </div>
        )}

        {/* ── Shows ── */}
        {shows.length > 0 && (
          <div>
            <SectionHeader label="Shows" color={C.show} count={shows.length} />
            <div className="space-y-2">
              {shows.map((show: ShowEntry) => (
                <div
                  key={show.id}
                  className="rounded-xl p-3 border"
                  style={{ background: "rgba(234,179,8,0.04)", borderColor: "rgba(234,179,8,0.15)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{show.name}</span>
                        <StatusBadge status={show.status} />
                      </div>
                      {show.status !== "scheduled" && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                          {show.cards_bought > 0 && <span>{show.cards_bought} bought</span>}
                          {show.cards_sold > 0   && <span>{show.cards_sold} sold</span>}
                          {show.trades_count > 0  && <span>{show.trades_count} trades</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {show.status !== "scheduled" && (
                        <div className="text-right">
                          <div className="text-sm font-bold" style={{ color: show.net_pl >= 0 ? C.sell : C.buy }}>
                            {fmt$(show.net_pl)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">net P&L</div>
                        </div>
                      )}
                      {show.status === "scheduled" && (
                        <Link
                          href="/protected/shows"
                          className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
                          style={{ color: "var(--accent-primary)", background: "rgba(139,92,246,0.10)" }}
                        >
                          <Zap size={10} />
                          Start Show
                        </Link>
                      )}
                      {show.status === "active" && (
                        <Link
                          href="/protected/show"
                          className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
                          style={{ color: "#eab308", background: "rgba(234,179,8,0.10)" }}
                        >
                          <ArrowRight size={10} />
                          Go to Show
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Buys ── */}
        {buys.length > 0 && (
          <div>
            <SectionHeader label="Buys" color={C.buy} count={buys.length} />
            <div className="space-y-1">
              {buys.map((b: BuyEntry) => (
                <div key={b.id} className="flex items-center gap-2.5 py-1.5 border-b border-white/[0.05] last:border-0">
                  {b.image_url ? (
                    <button onClick={() => setLightboxUrl(b.image_url!)} className="shrink-0">
                      <Image
                        src={b.image_url} alt={b.name}
                        width={36} height={50}
                        className="rounded-md object-cover w-9 h-[50px] hover:opacity-80 transition-opacity"
                      />
                    </button>
                  ) : (
                    <div className="w-9 h-[50px] rounded-md shrink-0 flex items-center justify-center" style={{ background: "var(--bg-surface)" }}>
                      <span className="text-[9px] text-muted-foreground">IMG</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{b.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {b.grade ?? b.condition}
                      {b.owner && ` · ${b.owner}`}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold" style={{ color: C.buy }}>{fmt$(b.cost ?? 0)}</div>
                    {b.market != null && (
                      <div className="text-[10px] text-muted-foreground">mkt {fmt$(b.market)}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Sells ── */}
        {sells.length > 0 && (
          <div>
            <SectionHeader label="Sells" color={C.sell} count={sells.length} />
            <div className="space-y-1">
              {sells.map((s: SellEntry) => (
                <div key={s.id} className="flex items-center gap-2.5 py-1.5 border-b border-white/[0.05] last:border-0">
                  {s.image_url ? (
                    <button onClick={() => setLightboxUrl(s.image_url!)} className="shrink-0">
                      <Image
                        src={s.image_url} alt={s.name}
                        width={36} height={50}
                        className="rounded-md object-cover w-9 h-[50px] hover:opacity-80 transition-opacity"
                      />
                    </button>
                  ) : (
                    <div className="w-9 h-[50px] rounded-md shrink-0 flex items-center justify-center" style={{ background: "var(--bg-surface)" }}>
                      <span className="text-[9px] text-muted-foreground">IMG</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.grade ?? s.condition}
                      {s.owner && ` · ${s.owner}`}
                      {s.sold_at && ` · ${fmtTime(s.sold_at)}`}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold" style={{ color: C.sell }}>{fmt$(s.sold_price ?? 0)}</div>
                    {s.margin != null && (
                      <div className="text-[10px] font-medium" style={{ color: s.margin >= 0 ? C.sell : C.buy }}>
                        {s.margin >= 0 ? "+" : ""}{fmt$(s.margin)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Trades ── */}
        {trades.length > 0 && (
          <div>
            <SectionHeader label="Trades" color={C.trade} count={trades.length} />
            <div className="space-y-1">
              {trades.map((t: TradeEntry) => (
                <div key={t.id} className="flex items-center gap-2.5 py-1.5 border-b border-white/[0.05] last:border-0">
                  {t.deal_photo_url ? (
                    <button onClick={() => setLightboxUrl(t.deal_photo_url!)} className="shrink-0">
                      <Image
                        src={t.deal_photo_url} alt="Deal photo"
                        width={40} height={40}
                        className="rounded-md object-cover w-10 h-10 hover:opacity-80 transition-opacity"
                      />
                    </button>
                  ) : (
                    <div className="w-10 h-10 rounded-md shrink-0" style={{ background: "var(--bg-surface)" }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{t.card_name ?? "Trade"}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtTime(t.scanned_at)}
                      {t.notes && ` · ${t.notes}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Expenses ── */}
        {expenses.length > 0 && (
          <div>
            <SectionHeader label="Expenses" color={C.exp} count={expenses.length} />
            <div className="space-y-1">
              {expenses.map((e: ExpenseEntry) => (
                <div key={e.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-white/[0.05] last:border-0">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{e.description}</div>
                    <div className="text-xs text-muted-foreground">{e.paid_by} · {fmtTime(e.created_at)}</div>
                  </div>
                  <div className="text-sm font-bold text-muted-foreground shrink-0">{fmt$(e.cost)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Schedule Show modal ────────────────────────────────────────────────────────

function ScheduleShowModal({
  open,
  date,
  onDateChange,
  onClose,
  onSubmit,
  busy,
  err,
}: {
  open: boolean;
  date: string;
  onDateChange: (d: string) => void;
  onClose: () => void;
  onSubmit: (data: { name: string; location: string; hours: string; startingCash: string; notes: string }) => void;
  busy: boolean;
  err: string;
}) {
  const [name, setName]               = useState("");
  const [location, setLocation]       = useState("");
  const [hours, setHours]             = useState("");
  const [startingCash, setStartingCash] = useState("");
  const [notes, setNotes]             = useState("");

  // Reset on open
  useEffect(() => {
    if (open) { setName(""); setLocation(""); setHours(""); setStartingCash(""); setNotes(""); }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 modal-backdrop flex items-center justify-center p-4"
      style={{ zIndex: 9999 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="modal-panel w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ maxHeight: "85vh", display: "flex", flexDirection: "column" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0">
          <h2 className="modal-title text-base">Schedule Show</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/8 transition-colors text-muted-foreground"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable fields */}
        <div className="px-6 pb-2 space-y-3.5 overflow-y-auto flex-1">
          {/* Show Name — required */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
              Show Name <span className="text-rose-400">*</span>
            </label>
            <input
              className="w-full"
              placeholder="e.g. Portland Card Show"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Date — required */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
              Date <span className="text-rose-400">*</span>
            </label>
            <input
              type="date"
              className="w-full"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
            />
          </div>

          {/* Location — optional */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
              Location <span className="text-muted-foreground/40 normal-case font-normal tracking-normal text-[11px]">optional</span>
            </label>
            <input
              className="w-full"
              placeholder="e.g. Portland Convention Center"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          {/* Hours — optional */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
              Hours <span className="text-muted-foreground/40 normal-case font-normal tracking-normal text-[11px]">optional</span>
            </label>
            <input
              className="w-full"
              placeholder="e.g. 10am – 4pm"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>

          {/* Starting Cash — optional */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
              Starting Cash <span className="text-muted-foreground/40 normal-case font-normal tracking-normal text-[11px]">optional</span>
            </label>
            <input
              type="number"
              className="w-full"
              placeholder="e.g. 500"
              min="0"
              step="0.01"
              value={startingCash}
              onChange={(e) => setStartingCash(e.target.value)}
            />
          </div>

          {/* Notes — optional */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
              Notes <span className="text-muted-foreground/40 normal-case font-normal tracking-normal text-[11px]">optional</span>
            </label>
            <textarea
              className="w-full resize-none"
              rows={2}
              placeholder="Any notes about this show…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {err && <p className="text-xs text-rose-400 font-medium">{err}</p>}
        </div>

        {/* Footer buttons */}
        <div className="flex gap-2 px-6 py-4 shrink-0 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <button className="modal-btn-ghost flex-1" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="modal-btn-primary flex-1"
            onClick={() => onSubmit({ name, location, hours, startingCash, notes })}
            disabled={busy || !name.trim() || !date}
          >
            {busy ? <span className="flex items-center justify-center gap-2"><Loader2 size={13} className="animate-spin" />Scheduling…</span> : "Schedule Show"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type ViewMode = "week" | "month";

export default function CalendarClient({
  initialData,
  initialYear,
  initialMonth,
  todayStr,
}: {
  initialData: DayActivity[];
  initialYear: number;
  initialMonth: number;
  todayStr: string;
}) {
  const [currentYear, setCurrentYear]   = useState(initialYear);
  const [currentMonth, setCurrentMonth] = useState(initialMonth);
  const [monthData, setMonthData]       = useState<DayActivity[]>(initialData);
  const [monthLoading, startMonthTransition] = useTransition();

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayDetail, setDayDetail]       = useState<DayDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // View mode — defaults to week, then reads localStorage on mount
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  useEffect(() => {
    const stored = localStorage.getItem("cal_view") as ViewMode | null;
    if (stored === "week" || stored === "month") {
      setViewMode(stored);
    } else if (window.innerWidth >= 768) {
      setViewMode("month");
    }
  }, []);

  // Week strip state
  const [weekStart, setWeekStart] = useState(() => getSundayOfWeek(todayStr));

  // Schedule modal state
  const [scheduleOpen, setScheduleOpen]   = useState(false);
  const [scheduleDate, setScheduleDate]   = useState(todayStr);
  const [scheduleBusy, setScheduleBusy]   = useState(false);
  const [scheduleErr, setScheduleErr]     = useState("");

  // Lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // ── Derived ───────────────────────────────────────────────────────────────

  const activityMap = new Map<string, DayActivity>();
  for (const d of monthData) activityMap.set(d.date, d);

  const todayActivity = activityMap.get(todayStr);
  const todayBuys     = todayActivity?.buyCount  ?? 0;
  const todaySells    = todayActivity?.sellCount ?? 0;
  const todayTrades   = todayActivity?.tradeCount ?? 0;
  const todayNet      = todayActivity?.netPL ?? 0;
  const todayShows    = todayActivity?.shows ?? [];
  const activeShow    = todayShows.find((s) => s.status === "active");

  // ── View toggle ───────────────────────────────────────────────────────────

  function setView(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem("cal_view", mode);
  }

  // ── Month navigation ──────────────────────────────────────────────────────

  function loadMonth(y: number, m: number) {
    startMonthTransition(async () => {
      const data = await getCalendarMonthData(y, m).catch(() => []);
      setCurrentYear(y);
      setCurrentMonth(m);
      setMonthData(data);
    });
  }

  function prevMonth() {
    let y = currentYear, m = currentMonth - 1;
    if (m < 1) { m = 12; y--; }
    loadMonth(y, m);
  }
  function nextMonth() {
    let y = currentYear, m = currentMonth + 1;
    if (m > 12) { m = 1; y++; }
    loadMonth(y, m);
  }
  function goToday() {
    const now = new Date();
    loadMonth(now.getFullYear(), now.getMonth() + 1);
    setWeekStart(getSundayOfWeek(todayStr));
    setSelectedDate(null);
    setDayDetail(null);
  }

  // ── Week navigation — auto-load month if week crosses boundary ────────────

  function prevWeek() {
    const newStart = addDays(weekStart, -7);
    setWeekStart(newStart);
    const wm = parseInt(newStart.slice(5, 7));
    const wy = parseInt(newStart.slice(0, 4));
    if (wm !== currentMonth || wy !== currentYear) loadMonth(wy, wm);
  }
  function nextWeek() {
    const newStart = addDays(weekStart, 7);
    setWeekStart(newStart);
    // Use the middle of the week to determine month
    const mid = addDays(newStart, 3);
    const wm = parseInt(mid.slice(5, 7));
    const wy = parseInt(mid.slice(0, 4));
    if (wm !== currentMonth || wy !== currentYear) loadMonth(wy, wm);
  }

  // ── Day selection ─────────────────────────────────────────────────────────

  const selectDay = useCallback(async (dateStr: string) => {
    if (selectedDate === dateStr) {
      setSelectedDate(null);
      setDayDetail(null);
      return;
    }
    setSelectedDate(dateStr);
    setDetailLoading(true);
    try {
      const detail = await getDayDetail(dateStr);
      setDayDetail(detail);
    } catch {
      setDayDetail({ date: dateStr, buys: [], sells: [], trades: [], expenses: [], shows: [] });
    } finally {
      setDetailLoading(false);
    }
  }, [selectedDate]);

  // ── Month grid cells ──────────────────────────────────────────────────────

  const firstDay       = new Date(currentYear, currentMonth - 1, 1).getDay();
  const daysInMonth    = new Date(currentYear, currentMonth, 0).getDate();
  const prevMonthDays  = new Date(currentYear, currentMonth - 1, 0).getDate();

  const cells: { dateStr: string; day: number; currentMonth: boolean }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    let m = currentMonth - 1, y = currentYear;
    if (m < 1) { m = 12; y--; }
    cells.push({ dateStr: `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`, day: d, currentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      dateStr: `${currentYear}-${String(currentMonth).padStart(2,"0")}-${String(d).padStart(2,"0")}`,
      day: d,
      currentMonth: true,
    });
  }
  let trailing = 1;
  while (cells.length % 7 !== 0 || cells.length < 35) {
    let m = currentMonth + 1, y = currentYear;
    if (m > 12) { m = 1; y++; }
    cells.push({ dateStr: `${y}-${String(m).padStart(2,"0")}-${String(trailing).padStart(2,"0")}`, day: trailing, currentMonth: false });
    trailing++;
  }

  // ── Week strip days ───────────────────────────────────────────────────────

  const weekDays: string[] = [];
  for (let i = 0; i < 7; i++) weekDays.push(addDays(weekStart, i));

  // ── Schedule show ─────────────────────────────────────────────────────────

  function openScheduleModal(dateStr?: string) {
    setScheduleDate(dateStr ?? todayStr);
    setScheduleErr("");
    setScheduleOpen(true);
  }

  async function handleScheduleShow(fields: {
    name: string; location: string; hours: string; startingCash: string; notes: string;
  }) {
    if (!fields.name.trim()) { setScheduleErr("Show name is required"); return; }
    setScheduleBusy(true);
    setScheduleErr("");
    try {
      await scheduleShow({
        name: fields.name.trim(),
        date: scheduleDate,
        location: fields.location || undefined,
        hours:    fields.hours || undefined,
        startingCash: fields.startingCash ? parseFloat(fields.startingCash) : undefined,
        notes:    fields.notes || undefined,
      });
      setScheduleOpen(false);
      const data = await getCalendarMonthData(currentYear, currentMonth).catch(() => monthData);
      setMonthData(data);
      if (selectedDate === scheduleDate) {
        const detail = await getDayDetail(scheduleDate).catch(() => dayDetail);
        setDayDetail(detail);
      }
    } catch (e: unknown) {
      setScheduleErr(e instanceof Error ? e.message : "Failed to schedule show");
    } finally {
      setScheduleBusy(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-28 space-y-4">

      {/* ── Today widget ── */}
      <div
        className="rounded-2xl border px-4 py-3.5 cursor-pointer transition-all"
        style={{ background: "var(--bg-elevated)", borderColor: "var(--border-subtle)" }}
        onClick={() => selectDay(todayStr)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Today</span>
              <span className="text-[10px] text-muted-foreground">{fmtShortDate(todayStr)}</span>
            </div>

            {/* Active show */}
            {activeShow && (
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: C.show }} />
                <span className="text-sm font-semibold truncate" style={{ color: C.show }}>
                  {activeShow.name}
                </span>
              </div>
            )}

            {/* Stats */}
            {(todayBuys > 0 || todaySells > 0 || todayTrades > 0) ? (
              <div className="flex items-center gap-3 flex-wrap">
                {todayBuys > 0 && (
                  <span className="text-xs font-medium" style={{ color: C.buy }}>
                    {todayBuys} buy{todayBuys !== 1 ? "s" : ""}
                  </span>
                )}
                {todaySells > 0 && (
                  <span className="text-xs font-medium" style={{ color: C.sell }}>
                    {todaySells} sell{todaySells !== 1 ? "s" : ""}
                  </span>
                )}
                {todayTrades > 0 && (
                  <span className="text-xs font-medium" style={{ color: C.trade }}>
                    {todayTrades} trade{todayTrades !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            ) : (
              !activeShow && (
                <span className="text-xs text-muted-foreground">No activity yet</span>
              )
            )}
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            {todayNet !== 0 && (
              <span className="text-lg font-bold leading-none" style={{ color: todayNet > 0 ? C.sell : C.buy }}>
                {fmt$(todayNet)}
              </span>
            )}
            {activeShow && (
              <Link
                href="/protected/show"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
                style={{ color: "#eab308", background: "rgba(234,179,8,0.10)" }}
              >
                <Zap size={10} />
                Go to Show
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Calendar header ── */}
      <div className="flex items-center justify-between gap-2">
        {/* Month nav */}
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg hover:bg-white/8 transition-colors text-muted-foreground"
            disabled={monthLoading}
          >
            <ChevronLeft size={17} />
          </button>
          <div className="flex items-center gap-1.5 min-w-[148px] justify-center">
            <h2 className="text-sm font-bold">
              {MONTH_NAMES[currentMonth - 1]} {currentYear}
            </h2>
            {monthLoading && <Loader2 size={12} className="animate-spin text-muted-foreground shrink-0" />}
          </div>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-lg hover:bg-white/8 transition-colors text-muted-foreground"
            disabled={monthLoading}
          >
            <ChevronRight size={17} />
          </button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={goToday}
            className="text-xs font-medium px-2.5 py-1 rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            Today
          </button>

          {/* Week/Month toggle */}
          <div className="flex items-center rounded-lg overflow-hidden border" style={{ borderColor: "var(--border-subtle)" }}>
            {(["week", "month"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setView(mode)}
                className="text-xs font-semibold px-2.5 py-1 transition-all capitalize"
                style={viewMode === mode
                  ? { background: "var(--accent-primary)", color: "#fff" }
                  : { color: "var(--text-secondary)", background: "transparent" }
                }
              >
                {mode}
              </button>
            ))}
          </div>

          <button
            onClick={() => openScheduleModal(selectedDate ?? todayStr)}
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
            style={{ color: "var(--accent-primary)", background: "rgba(139,92,246,0.12)" }}
          >
            <Plus size={12} />
            Show
          </button>
        </div>
      </div>

      {/* ── WEEK VIEW ── */}
      {viewMode === "week" && (
        <div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={prevWeek}
              className="p-1.5 rounded-lg hover:bg-white/8 transition-colors text-muted-foreground shrink-0"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex flex-1 gap-1 px-0.5">
              {weekDays.map((dateStr) => (
                <WeekCell
                  key={dateStr}
                  dateStr={dateStr}
                  isToday={dateStr === todayStr}
                  isSelected={dateStr === selectedDate}
                  activity={activityMap.get(dateStr)}
                  onClick={() => selectDay(dateStr)}
                />
              ))}
            </div>
            <button
              onClick={nextWeek}
              className="p-1.5 rounded-lg hover:bg-white/8 transition-colors text-muted-foreground shrink-0"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="mt-2 px-1 flex justify-end"><Legend /></div>
        </div>
      )}

      {/* ── MONTH VIEW ── */}
      {viewMode === "month" && (
        <div>
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAY_ABBREVS.map((d) => (
              <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground py-1">
                {d.slice(0, 1)}<span className="hidden sm:inline">{d.slice(1)}</span>
              </div>
            ))}
          </div>
          {/* Grid */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => (
              <DayCell
                key={cell.dateStr}
                dateStr={cell.dateStr}
                day={cell.day}
                isToday={cell.dateStr === todayStr}
                isSelected={cell.dateStr === selectedDate}
                isCurrentMonth={cell.currentMonth}
                activity={activityMap.get(cell.dateStr)}
                onClick={() => selectDay(cell.dateStr)}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-end"><Legend /></div>
        </div>
      )}

      {/* ── Day detail ── */}
      {selectedDate && (
        detailLoading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
            <Loader2 size={15} className="animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : (
          <DayDetailPanel
            detail={dayDetail}
            dateStr={selectedDate}
            todayStr={todayStr}
            onScheduleShow={() => openScheduleModal(selectedDate)}
            onClose={() => { setSelectedDate(null); setDayDetail(null); }}
            setLightboxUrl={setLightboxUrl}
          />
        )
      )}

      {/* ── Schedule Show modal ── */}
      <ScheduleShowModal
        open={scheduleOpen}
        date={scheduleDate}
        onDateChange={setScheduleDate}
        onClose={() => setScheduleOpen(false)}
        onSubmit={handleScheduleShow}
        busy={scheduleBusy}
        err={scheduleErr}
      />

      {/* ── Lightbox ── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/92 p-4"
          style={{ zIndex: 9999 }}
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 text-white/60 hover:text-white transition-colors"
            onClick={() => setLightboxUrl(null)}
          >
            <X size={22} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Full size"
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeftRight, ArrowRight, Plus, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState, MoneyDisplay, SectionHeader, StatCard } from "@/components/ui";
import type {
  BuyEntry, DayDetail, ExpenseEntry, SellEntry, ShowEntry, TradeEntry,
} from "../actions";
import { DOT_BG, fmtLongDate, fmtTime, isFuture, type ActivityKind } from "./helpers";

const softBtn =
  "flex h-11 items-center gap-1.5 whitespace-nowrap rounded-lg bg-accent-primary-soft px-4 text-sm font-semibold text-accent-primary transition-colors duration-150 hover:bg-accent-primary-border";

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CLS: Record<string, string> = {
  scheduled: "bg-accent-primary-soft text-accent-primary border-accent-primary-border",
  active: "bg-warning-soft text-warning border-warning-border",
  completed: "bg-positive-soft text-positive border-positive-border",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
        STATUS_CLS[status] ?? "border-border bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

// ── Section label with colored dot + count ────────────────────────────────────

function Section({ kind, label, count, children }: {
  kind: ActivityKind; label: string; count: number; children: React.ReactNode;
}) {
  return (
    <section>
      <SectionHeader
        className="mb-2"
        action={<span className="text-xs tabular-nums text-muted-foreground">{count}</span>}
      >
        <span className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_BG[kind]}`} />
          {label}
        </span>
      </SectionHeader>
      {children}
    </section>
  );
}

// ── Card thumbnail ────────────────────────────────────────────────────────────

function Thumb({ url, alt, onOpen }: { url: string | null; alt: string; onOpen: (url: string) => void }) {
  if (!url) {
    return (
      <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <span className="text-xs text-muted-foreground">IMG</span>
      </div>
    );
  }
  return (
    <button type="button" onClick={() => onOpen(url)} className="shrink-0" aria-label="View image">
      <Image
        src={url} alt={alt} width={36} height={48}
        className="h-12 w-9 rounded-lg object-cover transition-opacity duration-150 hover:opacity-80"
      />
    </button>
  );
}

const rowCls = "flex items-center gap-3 border-b border-border py-2 last:border-0";

// ── Show card ─────────────────────────────────────────────────────────────────

function ShowCard({ show }: { show: ShowEntry }) {
  const started = show.status !== "scheduled";
  return (
    <div className="rounded-xl border border-warning-border bg-warning-soft p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{show.name}</span>
            <StatusBadge status={show.status} />
          </div>
          {started && (
            <div className="mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums text-muted-foreground">
              {show.cards_bought > 0 && <span>{show.cards_bought} bought</span>}
              {show.cards_sold > 0 && <span>{show.cards_sold} sold</span>}
              {show.trades_count > 0 && <span>{show.trades_count} trades</span>}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {started && (
            <div className="text-right">
              <MoneyDisplay amount={show.net_pl} showSign className="text-sm font-semibold" />
              <div className="text-xs text-muted-foreground">net P&L</div>
            </div>
          )}
          {show.status === "scheduled" && (
            <Link href={`/protected/shows/${show.id}`} className={softBtn}>
              <Zap size={14} />
              Open Show
            </Link>
          )}
          {show.status === "active" && (
            <Link
              href="/protected/pos"
              className="flex h-11 items-center gap-1.5 whitespace-nowrap rounded-lg border border-warning-border bg-card px-4 text-sm font-semibold text-warning transition-colors duration-150 hover:bg-muted"
            >
              <ArrowRight size={14} />
              Go to Show
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Entry rows ────────────────────────────────────────────────────────────────

function BuyRow({ b, onOpen }: { b: BuyEntry; onOpen: (url: string) => void }) {
  return (
    <li className={rowCls}>
      <Thumb url={b.image_url} alt={b.name} onOpen={onOpen} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{b.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {b.grade ?? b.condition}
          {b.owner && ` · ${b.owner}`}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <MoneyDisplay amount={b.cost ?? 0} tone="negative" className="text-sm font-semibold" />
        {b.market != null && (
          <div className="text-xs text-muted-foreground">
            mkt <MoneyDisplay amount={b.market} tone="neutral" className="text-muted-foreground" />
          </div>
        )}
      </div>
    </li>
  );
}

function SellRow({ s, onOpen }: { s: SellEntry; onOpen: (url: string) => void }) {
  return (
    <li className={rowCls}>
      <Thumb url={s.image_url} alt={s.name} onOpen={onOpen} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{s.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {s.grade ?? s.condition}
          {s.owner && ` · ${s.owner}`}
          {s.sold_at && ` · ${fmtTime(s.sold_at)}`}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <MoneyDisplay amount={s.sold_price ?? 0} tone="positive" className="text-sm font-semibold" />
        {s.margin != null && (
          <div className="text-xs font-medium">
            <MoneyDisplay amount={s.margin} showSign />
          </div>
        )}
      </div>
    </li>
  );
}

function TradeRow({ t, onOpen }: { t: TradeEntry; onOpen: (url: string) => void }) {
  return (
    <li className={rowCls}>
      {t.deal_photo_url ? (
        <Thumb url={t.deal_photo_url} alt="Deal photo" onOpen={onOpen} />
      ) : (
        <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-primary-soft text-accent-primary">
          <ArrowLeftRight size={16} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{t.card_name ?? "Trade"}</div>
        <div className="truncate text-xs text-muted-foreground">
          {fmtTime(t.scanned_at)}
          {t.notes && ` · ${t.notes}`}
        </div>
      </div>
    </li>
  );
}

function ExpenseRow({ e }: { e: ExpenseEntry }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground">{e.description}</div>
        <div className="text-xs text-muted-foreground">{e.paid_by} · {fmtTime(e.created_at)}</div>
      </div>
      <MoneyDisplay amount={e.cost} tone="neutral" className="shrink-0 text-sm font-semibold" />
    </li>
  );
}

// ── Day detail panel ──────────────────────────────────────────────────────────

export function DayDetailPanel({
  detail, dateStr, todayStr, onScheduleShow, onClose, onOpenImage,
}: {
  detail: DayDetail | null;
  dateStr: string;
  todayStr: string;
  onScheduleShow: () => void;
  onClose: () => void;
  onOpenImage: (url: string | null) => void;
}) {
  if (!detail) return null;

  const { buys, sells, trades, expenses, shows } = detail;
  const hasAnything = buys.length + sells.length + trades.length + expenses.length + shows.length > 0;
  const isFutureDay = isFuture(dateStr, todayStr);
  const isToday = dateStr === todayStr;

  const cashIn = sells.reduce((s, x) => s + (x.sold_price ?? 0), 0);
  const cashOut = buys.reduce((s, x) => s + (x.cost ?? 0), 0)
    + expenses.reduce((s, x) => s + (x.cost ?? 0), 0);
  const hasMoney = cashIn > 0 || cashOut > 0;

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-card">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          {(isToday || isFutureDay) && (
            <SectionHeader className="mb-1">{isToday ? "Today" : "Upcoming"}</SectionHeader>
          )}
          <h3 className="text-base font-semibold text-foreground">{fmtLongDate(dateStr)}</h3>
          {hasMoney && (
            <div className="mt-1 text-xs text-muted-foreground">
              Net <MoneyDisplay amount={cashIn - cashOut} showSign className="text-sm font-semibold" />
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {(isFutureDay || isToday) && (
            <button type="button" onClick={onScheduleShow} className={softBtn}>
              <Plus size={16} />
              Schedule
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="space-y-5 p-4">
        {/* ── Empty state ── */}
        {!hasAnything && (
          <EmptyState
            title={isFutureDay ? "Nothing scheduled" : "No activity"}
            hint={isFutureDay ? "Schedule a show for this day to see it on the calendar." : "Buys, sells, trades and expenses recorded on this day will appear here."}
            cta={isFutureDay ? (
              <button type="button" onClick={onScheduleShow} className={cn(softBtn, "w-full justify-center")}>
                <Plus size={16} />
                Schedule a Show
              </button>
            ) : undefined}
          />
        )}

        {/* ── Cash summary ── */}
        {hasMoney && (
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Cash in" money={cashIn} />
            <StatCard label="Cash out" money={cashOut} />
          </div>
        )}

        {shows.length > 0 && (
          <Section kind="show" label="Shows" count={shows.length}>
            <div className="space-y-2">
              {shows.map((show) => <ShowCard key={show.id} show={show} />)}
            </div>
          </Section>
        )}

        {buys.length > 0 && (
          <Section kind="buy" label="Buys" count={buys.length}>
            <ul>{buys.map((b) => <BuyRow key={b.id} b={b} onOpen={onOpenImage} />)}</ul>
          </Section>
        )}

        {sells.length > 0 && (
          <Section kind="sell" label="Sells" count={sells.length}>
            <ul>{sells.map((s) => <SellRow key={s.id} s={s} onOpen={onOpenImage} />)}</ul>
          </Section>
        )}

        {trades.length > 0 && (
          <Section kind="trade" label="Trades" count={trades.length}>
            <ul>{trades.map((t) => <TradeRow key={t.id} t={t} onOpen={onOpenImage} />)}</ul>
          </Section>
        )}

        {expenses.length > 0 && (
          <Section kind="expense" label="Expenses" count={expenses.length}>
            <ul>{expenses.map((e) => <ExpenseRow key={e.id} e={e} />)}</ul>
          </Section>
        )}
      </div>
    </div>
  );
}

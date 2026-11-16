"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Link2, Plus } from "lucide-react";
import { MoneyDisplay } from "@/components/ui";
import { PayoutHistory } from "./PayoutSection";
import {
  type Consigner, type SoldItem, fmtDate, initials,
  BTN_SOFT, BTN_OUTLINE, BTN_GHOST, BTN_DANGER,
} from "./shared";

// ── Small stat cell (label over value) ──

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-base font-semibold tabular-nums text-foreground">{value}</dd>
      {sub && <dd className="truncate text-xs tabular-nums text-muted-foreground">{sub}</dd>}
    </div>
  );
}

// ── Sales history (collapsible, one row per sold item) ──

function SalesHistory({ sales }: { sales: SoldItem[] }) {
  const [open, setOpen] = useState(false);
  if (sales.length === 0) return null;

  const revenue = sales.reduce((s, it) => s + (it.sold_price ?? 0), 0);
  const theirCut = sales.reduce((s, it) => s + (it.consigner_payout ?? 0), 0);
  const ourCut = revenue - theirCut;

  return (
    <div className="border-t border-border">
      <button
        type="button"
        className="flex h-11 w-full items-center justify-between px-4 text-sm transition-colors duration-150 hover:bg-muted"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 font-medium text-foreground">
          {open ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
          Sales <span className="tabular-nums text-muted-foreground">({sales.length})</span>
        </span>
        <span className="text-xs text-muted-foreground">
          you kept <MoneyDisplay amount={ourCut} tone="neutral" />
        </span>
      </button>

      {open && (
        <ul className="border-t border-border">
          {sales.map((sale) => {
            const meta = [sale.set_name, sale.card_number ? `#${sale.card_number}` : null].filter(Boolean).join(" · ");
            const ours = (sale.sold_price ?? 0) - (sale.consigner_payout ?? 0);
            return (
              <li key={sale.id} className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 text-sm last:border-b-0">
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">{sale.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {meta ? `${meta} · ` : ""}{fmtDate(sale.sold_at)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <MoneyDisplay amount={sale.consigner_payout ?? 0} tone="positive" className="font-semibold" />
                  <div className="text-xs text-muted-foreground">
                    sold <MoneyDisplay amount={sale.sold_price ?? 0} tone="neutral" /> · kept <MoneyDisplay amount={ours} tone="neutral" />
                  </div>
                </div>
              </li>
            );
          })}
          <li className="flex items-center justify-between border-t border-border bg-muted px-4 py-3 text-sm font-semibold">
            <span className="text-foreground">Total</span>
            <span className="text-xs font-normal text-muted-foreground">
              <MoneyDisplay amount={revenue} tone="neutral" /> sold · <MoneyDisplay amount={theirCut} tone="positive" className="font-semibold" /> theirs
            </span>
          </li>
        </ul>
      )}
    </div>
  );
}

// ── Consigner card ──

export function ConsignerCard({
  consigner: c,
  disabled,
  onEdit,
  onDelete,
  onReceive,
  onPayout,
  onCopyLink,
}: {
  consigner: Consigner;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReceive: () => void;
  onPayout: () => void;
  onCopyLink: () => void;
}) {
  const rate = Math.round(c.rate * 100);
  const owed = c.pending_payout;

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card">
      {/* ── Header: who, and what they're owed ── */}
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-tint text-sm font-semibold text-accent">
          {initials(c.name)}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-foreground">{c.name}</h2>
          <p className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">
            {rate}% to them{c.phone ? ` · ${c.phone}` : ""}
          </p>
          {c.notes && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.notes}</p>}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs text-muted-foreground">Owed</div>
          <MoneyDisplay amount={owed} tone={owed > 0 ? "positive" : "neutral"} className="text-lg font-semibold" />
        </div>
      </div>

      {/* ── Stats ── */}
      <dl className="grid grid-cols-3 gap-2 px-4 pb-4">
        <Stat
          label="Active"
          value={c.active_count}
          sub={c.active_market_value > 0 ? <><MoneyDisplay amount={c.active_market_value} tone="neutral" /> value</> : "no cards"}
        />
        <Stat
          label="Sold"
          value={c.sold_count}
          sub={c.sold_revenue > 0 ? <><MoneyDisplay amount={c.sold_revenue} tone="neutral" /> revenue</> : "nothing yet"}
        />
        <Stat
          label="Paid out"
          value={<MoneyDisplay amount={c.total_paid_out} tone={c.total_paid_out > 0 ? "positive" : "neutral"} />}
          sub={`${c.payouts.length} payment${c.payouts.length === 1 ? "" : "s"}`}
        />
      </dl>

      {/* ── Actions ── */}
      <div className="grid grid-cols-2 gap-2 px-4 pb-4">
        <button type="button" className={BTN_SOFT} onClick={onReceive} disabled={disabled}>
          <Plus size={16} /> Receive cards
        </button>
        <button type="button" className={BTN_OUTLINE} onClick={onPayout} disabled={disabled}>
          Record payout
        </button>
        <Link href="/protected/inventory" className={BTN_OUTLINE}>
          View items
        </Link>
        <button type="button" className={BTN_OUTLINE} onClick={onCopyLink}>
          <Link2 size={16} /> Copy portal link
        </button>
      </div>

      {/* ── History ── */}
      <SalesHistory sales={c.sales} />
      <PayoutHistory payouts={c.payouts} totalPaidOut={c.total_paid_out} />

      {/* ── Footer: portal token + manage ── */}
      <div className="flex items-center justify-between gap-3 border-t border-border py-1 pl-4 pr-1">
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
          /consigner/{c.token.slice(0, 12)}…
        </span>
        <div className="flex shrink-0">
          <button type="button" className={BTN_GHOST} onClick={onEdit} disabled={disabled}>Edit</button>
          <button type="button" className={BTN_DANGER} onClick={onDelete} disabled={disabled}>Delete</button>
        </div>
      </div>
    </article>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, Modal, MoneyDisplay, useConfirm, useToast } from "@/components/ui";
import { revertTransaction } from "@/app/protected/pos/actions";
import { METHOD_LABELS, PAYMENT_METHODS, type PaymentMethod } from "@/app/protected/pos/ledger";
import {
  cardSummary as summary, fmtDealDate as fmtDate, signedAmount as signed, sortDeals,
  type Deal, type DealSort,
} from "./deals";
import LedgerTable from "./LedgerTable";

// ── Transactions ──
// Phone: filters in a grid, then deal rows. Desktop (lg+): filters on one
// row, a count + net line, and a sortable table. Both open the same modal.

type Show = { id: string; name: string; date: string };

const select =
  "h-11 min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground";

const MODE_CLASS: Record<Deal["mode"], string> = {
  buy: "text-negative",
  sell: "text-positive",
  trade: "text-primary",
};

export default function LedgerClient({ deals, shows }: { deals: Deal[]; shows: Show[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [mode, setMode] = useState("all");
  const [method, setMethod] = useState("all");
  const [show, setShow] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<Deal | null>(null);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<DealSort>({ key: "date", dir: "desc" });

  const showName = new Map(shows.map((s) => [s.id, s.name]));
  const visible = deals.filter((d) =>
    (mode === "all" || d.mode === mode) &&
    (method === "all" || d.method === method) &&
    (show === "all" || (show === "none" ? !d.showId : d.showId === show)) &&
    (!from || d.date.slice(0, 10) >= from) &&
    (!to || d.date.slice(0, 10) <= to));
  const sorted = sortDeals(visible, sort);
  const net = visible.reduce((s, d) => s + signed(d), 0);

  async function revert(d: Deal) {
    const ok = await confirm({
      title: `Revert this ${d.mode}?`,
      description: "Cards it added leave inventory and cards it sold or traded come back. Photos are deleted.",
      confirmLabel: "Revert", destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await revertTransaction(d.id);
      toast.success("Reverted");
      setOpen(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't revert");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 py-4 lg:max-w-6xl">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Transactions</h1>

      {/* ── Filters ── */}
      <div className="grid grid-cols-3 gap-2 lg:grid-cols-5">
        <select className={select} value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Mode">
          <option value="all">All types</option>
          <option value="buy">Buys</option>
          <option value="sell">Sells</option>
          <option value="trade">Trades</option>
        </select>
        <select className={select} value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Payment method">
          <option value="all">Any method</option>
          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
        </select>
        <select className={select} value={show} onChange={(e) => setShow(e.target.value)} aria-label="Show">
          <option value="all">Any show</option>
          <option value="none">No show</option>
          {shows.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input type="date" className={`${select} col-span-3 sm:col-span-1`} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <input type="date" className={`${select} col-span-3 sm:col-span-1`} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
      </div>

      {/* ── Deals ── */}
      {visible.length === 0 ? (
        <EmptyState
          title={deals.length === 0 ? "No deals yet" : "No transactions match"}
          hint={deals.length === 0
            ? "Buys, sells and trades from the POS show up here."
            : "Try a wider date range or clear a filter."}
        />
      ) : (
        <>
          {/* Count and net of what the filters show; money from our side */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span className="tabular-nums">{visible.length} {visible.length === 1 ? "deal" : "deals"}</span>
            <span className="flex items-center gap-2">
              Net <MoneyDisplay amount={net} showSign className="font-semibold" />
            </span>
          </div>

          <div className="hidden lg:block">
            <LedgerTable deals={sorted} showName={showName} sort={sort} onSort={setSort} onOpen={setOpen} />
          </div>

          <div className="divide-y divide-border rounded-xl border border-border bg-card lg:hidden">
            {sorted.map((d) => (
              <button key={d.id} type="button" onClick={() => setOpen(d)}
                className="flex min-h-14 w-full items-center gap-3 p-3 text-left transition-colors duration-150 hover:bg-muted">
                <span className={`w-12 shrink-0 font-mono text-xs uppercase tracking-wider ${MODE_CLASS[d.mode]}`}>{d.mode}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{summary(d)}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[fmtDate(d.date), d.method && METHOD_LABELS[d.method as PaymentMethod], d.counterparty,
                      d.showId && showName.get(d.showId)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <MoneyDisplay amount={signed(d)} showSign className="shrink-0 text-sm font-semibold" />
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Detail ── */}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `${open.mode[0].toUpperCase()}${open.mode.slice(1)} · ${fmtDate(open.date)}` : ""}>
        {open && (
          <div className="space-y-4 text-sm">
            <div className="space-y-2">
              {open.cards.map((c, i) => (
                <div key={i} className="flex justify-between gap-3">
                  <span className="truncate text-foreground">{c.direction === "in" ? "↓" : "↑"} {c.name}</span>
                  {c.value != null
                    ? <MoneyDisplay amount={c.value} tone="neutral" className="shrink-0 text-foreground" />
                    : <span className="shrink-0 text-muted-foreground">—</span>}
                </div>
              ))}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-muted-foreground">
              <dt>{open.mode === "trade" ? "Cash" : "Total"}</dt><dd><MoneyDisplay amount={signed(open)} showSign /></dd>
              {open.method && <><dt>Method</dt><dd className="text-foreground">{METHOD_LABELS[open.method as PaymentMethod] ?? open.method}</dd></>}
              {open.counterparty && <><dt>With</dt><dd className="text-foreground">{open.counterparty}</dd></>}
              {open.paidBy && <><dt>Paid by</dt><dd className="capitalize text-foreground">{open.paidBy}</dd></>}
              {open.showId && <><dt>Show</dt><dd className="text-foreground">{showName.get(open.showId) ?? "—"}</dd></>}
              {open.notes && <><dt>Notes</dt><dd className="whitespace-pre-wrap text-foreground">{open.notes}</dd></>}
            </dl>
            {open.photos.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {open.photos.map((p) => (
                  <a key={p} href={p} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt="Deal photo" className="h-24 w-24 rounded-lg border border-border object-cover" />
                  </a>
                ))}
              </div>
            )}
            <button type="button" disabled={busy} onClick={() => revert(open)}
              className="h-11 w-full rounded-lg border border-negative-border bg-negative-soft font-medium text-negative-strong transition-colors duration-150 hover:bg-down-tint disabled:opacity-40 dark:text-negative">
              {busy ? "Reverting…" : "Revert"}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

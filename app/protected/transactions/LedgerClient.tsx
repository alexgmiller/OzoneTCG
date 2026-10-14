"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, MoneyDisplay, useConfirm, useToast } from "@/components/ui";
import { revertTransaction } from "@/app/protected/pos/actions";
import { METHOD_LABELS, PAYMENT_METHODS, type PaymentMethod } from "@/app/protected/pos/ledger";
import type { Deal } from "./deals";

type Show = { id: string; name: string; date: string };

const select = "h-10 border rounded-lg px-2 text-sm bg-background min-w-0";
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

// Money from our point of view: buys and cash we pay out are negative
const signed = (d: Deal) => (d.mode === "sell" ? d.amount : -d.amount);

function summary(d: Deal) {
  const names = d.cards.map((c) => c.name);
  return names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
}

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

  const showName = new Map(shows.map((s) => [s.id, s.name]));
  const visible = deals.filter((d) =>
    (mode === "all" || d.mode === mode) &&
    (method === "all" || d.method === method) &&
    (show === "all" || (show === "none" ? !d.showId : d.showId === show)) &&
    (!from || d.date.slice(0, 10) >= from) &&
    (!to || d.date.slice(0, 10) <= to));

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
    <div className="w-full max-w-2xl mx-auto py-4 space-y-4">
      <h1 className="text-xl font-semibold">Transactions</h1>

      <div className="grid grid-cols-3 gap-2">
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

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">No transactions match.</p>
      ) : (
        <div className="border rounded-xl divide-y">
          {visible.map((d) => (
            <button key={d.id} type="button" onClick={() => setOpen(d)} className="w-full flex items-center gap-3 p-3 text-left">
              <span className="w-12 text-xs font-semibold uppercase text-muted-foreground">{d.mode}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm truncate">{summary(d)}</span>
                <span className="block text-xs text-muted-foreground truncate">
                  {[fmtDate(d.date), d.method && METHOD_LABELS[d.method as PaymentMethod], d.counterparty,
                    d.showId && showName.get(d.showId)].filter(Boolean).join(" · ")}
                </span>
              </span>
              <MoneyDisplay amount={signed(d)} />
            </button>
          ))}
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `${open.mode[0].toUpperCase()}${open.mode.slice(1)} · ${fmtDate(open.date)}` : ""}>
        {open && (
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              {open.cards.map((c, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span className="truncate">{c.direction === "in" ? "↓" : "↑"} {c.name}</span>
                  <span className="tabular-nums">{c.value != null ? `$${c.value.toFixed(2)}` : "—"}</span>
                </div>
              ))}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
              <dt>{open.mode === "trade" ? "Cash" : "Total"}</dt><dd><MoneyDisplay amount={signed(open)} /></dd>
              {open.method && <><dt>Method</dt><dd>{METHOD_LABELS[open.method as PaymentMethod] ?? open.method}</dd></>}
              {open.counterparty && <><dt>With</dt><dd>{open.counterparty}</dd></>}
              {open.paidBy && <><dt>Paid by</dt><dd className="capitalize">{open.paidBy}</dd></>}
              {open.showId && <><dt>Show</dt><dd>{showName.get(open.showId) ?? "—"}</dd></>}
              {open.notes && <><dt>Notes</dt><dd className="whitespace-pre-wrap">{open.notes}</dd></>}
            </dl>
            {open.photos.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {open.photos.map((p) => (
                  <a key={p} href={p} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt="Deal photo" className="w-24 h-24 object-cover rounded-lg border" />
                  </a>
                ))}
              </div>
            )}
            <button type="button" disabled={busy} onClick={() => revert(open)}
              className="w-full h-11 rounded-xl border border-negative-border text-negative font-medium disabled:opacity-40">
              {busy ? "Reverting…" : "Revert"}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

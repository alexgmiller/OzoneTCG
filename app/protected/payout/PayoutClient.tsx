"use client";

import { useState, useTransition } from "react";
import type { ExpenseEntry, ItemCostEntry, SharedSaleEntry, SoloSaleEntry, ConsignerSaleEntry, PayPeriod } from "./PayoutServer";
import { settlePeriod, makeItemShared, keepItemSolo } from "./actions";

function fmt(v: number) {
  return `$${v.toFixed(2)}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type Props = {
  alexExpenses: ExpenseEntry[];
  milaExpenses: ExpenseEntry[];
  alexItems: ItemCostEntry[];
  milaItems: ItemCostEntry[];
  sharedSales: SharedSaleEntry[];
  soloSales: SoloSaleEntry[];
  consignerSales: ConsignerSaleEntry[];
  history: PayPeriod[];
  periodStart: string | null;
};

function Section({
  title,
  rows,
  subtotal,
  green,
}: {
  title: string;
  rows: { label: string; sub: string; amount: number }[];
  subtotal: number;
  green?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b last:border-b-0">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-xs font-semibold uppercase tracking-wide opacity-60">{title}</span>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-sm font-semibold ${green ? "text-green-600" : ""}`}>
            {fmt(subtotal)}
          </span>
          <span className="text-xs opacity-40">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && (
        <div className="pb-1">
          {rows.map((r, i) => (
            <div
              key={i}
              className="px-4 py-2 flex items-center justify-between gap-3 border-t text-sm"
            >
              <div className="min-w-0">
                <div className="truncate">{r.label}</div>
                <div className="text-xs opacity-50">{r.sub}</div>
              </div>
              <div className={`shrink-0 font-medium ${green ? "text-green-600" : ""}`}>
                {fmt(r.amount)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemPurchasesSection({
  title,
  items,
  pendingSolo,
  onKeepSolo,
}: {
  title: string;
  items: ItemCostEntry[];
  pendingSolo: Set<string>;
  onKeepSolo: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const subtotal = items.reduce((s, i) => s + i.cost, 0);
  return (
    <div className="border-b last:border-b-0">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-xs font-semibold uppercase tracking-wide opacity-60">{title}</span>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-semibold">{fmt(subtotal)}</span>
          <span className="text-xs opacity-40">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && (
        <div className="pb-1">
          {items.map((item) => {
            const pending = pendingSolo.has(item.id);
            return (
              <div
                key={item.id}
                className="px-4 py-2 flex items-center justify-between gap-3 border-t text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate">{item.name}</div>
                  <div className="text-xs opacity-50">Inventory cost · {fmtDate(item.created_at)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-medium">{fmt(item.cost)}</span>
                  <button
                    disabled={pending}
                    onClick={() => onKeepSolo(item.id)}
                    className="text-xs px-2 py-0.5 rounded border opacity-40 hover:opacity-100 hover:bg-muted/50 disabled:opacity-20 transition-all"
                  >
                    {pending ? "Saving…" : "Solo"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PayoutClient({
  alexExpenses,
  milaExpenses,
  alexItems,
  milaItems,
  sharedSales,
  soloSales,
  consignerSales,
  history,
  periodStart,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [pendingShared, setPendingShared] = useState<Set<string>>(new Set());
  const [pendingSolo, setPendingSolo] = useState<Set<string>>(new Set());

  function handleMakeShared(itemId: string) {
    setPendingShared((prev) => new Set(prev).add(itemId));
    startTransition(async () => {
      await makeItemShared(itemId);
      setPendingShared((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    });
  }

  function handleKeepSolo(itemId: string) {
    setPendingSolo((prev) => new Set(prev).add(itemId));
    startTransition(async () => {
      await keepItemSolo(itemId);
      setPendingSolo((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    });
  }

  const alexTotal =
    alexExpenses.reduce((s, e) => s + e.cost, 0) +
    alexItems.reduce((s, i) => s + i.cost, 0);
  const milaTotal =
    milaExpenses.reduce((s, e) => s + e.cost, 0) +
    milaItems.reduce((s, i) => s + i.cost, 0);
  const salesTotal = sharedSales.reduce((s, i) => s + i.sold_price, 0);
  const consignerCutTotal = consignerSales.reduce(
    (s, it) => s + (it.sold_price - it.consigner_payout),
    0
  );

  const milaOwesAlex = 0.5 * alexTotal;
  const alexOwesMila = 0.5 * salesTotal + 0.5 * milaTotal + 0.5 * consignerCutTotal;
  const net = alexOwesMila - milaOwesAlex;
  const netAbs = Math.abs(net);
  const alexPaysMila = net > 0;

  const hasActivity =
    alexExpenses.length > 0 ||
    milaExpenses.length > 0 ||
    alexItems.length > 0 ||
    milaItems.length > 0 ||
    sharedSales.length > 0 ||
    soloSales.length > 0 ||
    consignerSales.length > 0;

  function toggle(id: string) {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  }

  function handleSettle() {
    startTransition(async () => {
      await settlePeriod();
    });
  }

  return (
    <div className="space-y-6">
      {/* Current period */}
      <div className="border rounded-xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b bg-muted/30">
          <div className="text-sm font-semibold">Current Period</div>
          <div className="text-xs opacity-60 mt-0.5">
            {periodStart ? fmtDate(periodStart) : "All time"} → {fmtDate(new Date().toISOString())}
          </div>
        </div>

        {!hasActivity && (
          <div className="px-4 py-8 text-sm opacity-50 text-center">
            No unsettled expenses or shared sales.
          </div>
        )}

        {/* Alex's expenses */}
        {alexExpenses.length > 0 && (
          <Section
            title="Alex's Expenses"
            subtotal={alexExpenses.reduce((s, e) => s + e.cost, 0)}
            rows={alexExpenses.map((e) => ({
              label: e.description,
              sub: fmtDate(e.created_at),
              amount: e.cost,
            }))}
          />
        )}

        {/* Alex's item purchases (with Solo opt-out) */}
        {alexItems.length > 0 && (
          <ItemPurchasesSection
            title="Alex's Inventory Purchases"
            items={alexItems}
            pendingSolo={pendingSolo}
            onKeepSolo={handleKeepSolo}
          />
        )}

        {/* Mila's expenses */}
        {milaExpenses.length > 0 && (
          <Section
            title="Mila's Expenses"
            subtotal={milaExpenses.reduce((s, e) => s + e.cost, 0)}
            rows={milaExpenses.map((e) => ({
              label: e.description,
              sub: fmtDate(e.created_at),
              amount: e.cost,
            }))}
          />
        )}

        {/* Mila's item purchases (with Solo opt-out) */}
        {milaItems.length > 0 && (
          <ItemPurchasesSection
            title="Mila's Inventory Purchases"
            items={milaItems}
            pendingSolo={pendingSolo}
            onKeepSolo={handleKeepSolo}
          />
        )}

        {/* Shared sales */}
        {sharedSales.length > 0 && (
          <Section
            title="Shared Sales"
            subtotal={salesTotal}
            green
            rows={sharedSales.map((s) => ({
              label: s.name,
              sub: s.sold_at ? fmtDate(s.sold_at) : "—",
              amount: s.sold_price,
            }))}
          />
        )}

        {/* Consigner sales — our cut */}
        {consignerSales.length > 0 && (
          <Section
            title="Consigner Sales (Our Cut)"
            subtotal={consignerCutTotal}
            green
            rows={consignerSales.map((s) => ({
              label: s.name,
              sub: s.sold_at ? fmtDate(s.sold_at) : "—",
              amount: s.sold_price - s.consigner_payout,
            }))}
          />
        )}

        {/* Solo sales — optional inclusion */}
        {soloSales.length > 0 && (
          <div className="border-b">
            <div className="px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide opacity-60">
                Solo Sales This Period
              </span>
              <span className="text-xs opacity-50">Not yet shared</span>
            </div>
            <p className="px-4 pb-2 text-xs opacity-50">
              These sold as personal inventory. Include any in the shared pool to split their revenue 50/50.
            </p>
            {soloSales.map((s) => {
              const pending = pendingShared.has(s.id);
              const profit = s.cost != null ? s.sold_price - s.cost : null;
              return (
                <div
                  key={s.id}
                  className="px-4 py-2.5 flex items-center justify-between gap-3 border-t text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{s.name}</div>
                    <div className="text-xs opacity-50 space-x-2">
                      <span className="capitalize">{s.owner}</span>
                      <span>· sold {s.sold_at ? fmtDate(s.sold_at) : "—"}</span>
                      {profit != null && (
                        <span className={profit >= 0 ? "text-green-600" : "text-red-500"}>
                          · {profit >= 0 ? "+" : ""}{fmt(profit)} profit
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold text-green-600">{fmt(s.sold_price)}</span>
                    <button
                      disabled={pending || pendingSolo.has(s.id)}
                      onClick={() => handleMakeShared(s.id)}
                      className="text-xs px-2.5 py-1 rounded-md border font-medium hover:bg-muted/50 disabled:opacity-40 transition-colors"
                    >
                      {pending ? "Adding…" : "Include in Shared"}
                    </button>
                    <button
                      disabled={pendingSolo.has(s.id) || pending}
                      onClick={() => handleKeepSolo(s.id)}
                      className="text-xs px-2.5 py-1 rounded-md border font-medium opacity-50 hover:opacity-100 hover:bg-muted/50 disabled:opacity-30 transition-all"
                    >
                      {pendingSolo.has(s.id) ? "Saving…" : "Keep as Solo"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Breakdown */}
        {hasActivity && (
          <div className="border-t px-4 py-3 space-y-1.5 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-2">
              Breakdown
            </div>
            <div className="flex justify-between">
              <span className="opacity-70">Mila owes Alex (50% of Alex's total)</span>
              <span>{fmt(milaOwesAlex)}</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-70">Alex owes Mila (50% of shared sales)</span>
              <span>{fmt(0.5 * salesTotal)}</span>
            </div>
            {consignerCutTotal > 0 && (
              <div className="flex justify-between">
                <span className="opacity-70">Alex owes Mila (50% of consigner cut)</span>
                <span>{fmt(0.5 * consignerCutTotal)}</span>
              </div>
            )}
            {milaTotal > 0 && (
              <div className="flex justify-between">
                <span className="opacity-70">Alex owes Mila (50% of Mila's total)</span>
                <span>{fmt(0.5 * milaTotal)}</span>
              </div>
            )}
          </div>
        )}

        {/* Net result */}
        {hasActivity && (
          <div className="border-t px-4 py-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">
                {netAbs < 0.01
                  ? "Break even"
                  : alexPaysMila
                  ? "Alex pays Mila"
                  : "Mila pays Alex"}
              </div>
              <div className="text-xs opacity-60">Net payout this period</div>
            </div>
            <div
              className={`text-2xl font-bold ${
                netAbs < 0.01 ? "" : alexPaysMila ? "text-red-500" : "text-green-600"
              }`}
            >
              {fmt(netAbs)}
            </div>
          </div>
        )}

        {/* Settle button */}
        <div className="px-4 pb-4">
          <button
            onClick={handleSettle}
            disabled={isPending || !hasActivity}
            className="w-full rounded-lg py-2.5 px-4 text-sm font-semibold bg-green-600 text-white disabled:opacity-40 hover:bg-green-700 transition-colors"
          >
            {isPending ? "Settling…" : "Mark as Settled"}
          </button>
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold px-1">Past Periods</div>
          {history.map((p) => {
            const pNet = Math.abs(p.net_payout);
            const pAlexPaysMila = p.net_payout > 0;
            const isOpen = expandedIds.has(p.id);

            return (
              <div key={p.id} className="border rounded-xl overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-left gap-3"
                  onClick={() => toggle(p.id)}
                >
                  <div>
                    <div className="text-sm font-medium">
                      {fmtDate(p.period_start)} → {fmtDate(p.period_end)}
                    </div>
                    <div className="text-xs opacity-60 mt-0.5">
                      {pNet < 0.01
                        ? "Break even"
                        : pAlexPaysMila
                        ? "Alex → Mila"
                        : "Mila → Alex"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div
                      className={`text-sm font-semibold ${
                        pNet < 0.01 ? "" : pAlexPaysMila ? "text-red-500" : "text-green-600"
                      }`}
                    >
                      {fmt(pNet)}
                    </div>
                    <span className="text-xs opacity-40">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t divide-y text-sm">
                    <div className="px-4 py-2.5 flex justify-between">
                      <span className="opacity-70">Alex's expenses & purchases</span>
                      <span>{fmt(p.alex_paid)}</span>
                    </div>
                    <div className="px-4 py-2.5 flex justify-between">
                      <span className="opacity-70">Mila's expenses & purchases</span>
                      <span>{fmt(p.mila_paid)}</span>
                    </div>
                    <div className="px-4 py-2.5 flex justify-between">
                      <span className="opacity-70">Shared sales</span>
                      <span className="text-green-600">{fmt(p.shared_sales)}</span>
                    </div>
                    <div className="px-4 py-2.5 flex justify-between font-semibold">
                      <span>{pAlexPaysMila ? "Alex paid Mila" : "Mila paid Alex"}</span>
                      <span className={pAlexPaysMila ? "text-red-500" : "text-green-600"}>
                        {fmt(pNet)}
                      </span>
                    </div>
                    {p.notes && (
                      <div className="px-4 py-2.5 text-xs opacity-60">{p.notes}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

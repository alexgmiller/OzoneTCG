"use client";

import { useState, useMemo } from "react";
import { Modal, MoneyDisplay } from "@/components/ui";
import { recordTrade } from "@/app/protected/pos/actions";
import type { Category, Condition } from "./types";
import { toNum, fmt, fieldClass, btnOutline, btnPrimary, pillClass } from "./utils";
import { TradeComingInCard, blankComingIn, entryCredit, type ComingInEntry, type TradeOwner } from "./components/TradeComingInCard";

type InventoryItem = {
  id: string;
  name: string;
  set_name: string | null;
  card_number: string | null;
  grade: string | null;
  category: Category;
  condition: Condition;
  owner: string;
  market: number | null;
  cost: number | null;
  cost_basis: number | null;
  chain_depth: number;
  original_cash_invested: number | null;
  acquisition_type: string | null;
};

const sectionLabel = "mb-2 font-mono text-xs uppercase tracking-[0.18em] text-neutral";
const fieldLabel = "mb-1 block font-mono text-xs uppercase tracking-[0.18em] text-neutral";

// ── Record Trade modal — cost basis carries forward through the chain ──
export default function TradeModal({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: InventoryItem[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cards going out
  const [outSearch, setOutSearch] = useState("");
  const [goingOut, setGoingOut] = useState<{ item: InventoryItem; tradeValue: string }[]>([]);

  // Cards coming in
  const [comingIn, setComingIn] = useState<ComingInEntry[]>([blankComingIn()]);

  // Cash adjustment
  const [cashOverride, setCashOverride] = useState<string>("");
  const [paidBy, setPaidBy] = useState<TradeOwner>("alex");
  const [notes, setNotes] = useState("");

  // ── Derived values ──
  const tradeCreditTotal = useMemo(() => comingIn.reduce((sum, c) => sum + entryCredit(c), 0), [comingIn]);
  const tradeOutTotal = useMemo(() => goingOut.reduce((sum, g) => sum + (toNum(g.tradeValue) ?? g.item.market ?? 0), 0), [goingOut]);
  const autoCashDiff = parseFloat((tradeCreditTotal - tradeOutTotal).toFixed(2));
  const cashDiff = cashOverride.trim() !== "" ? (toNum(cashOverride) ?? autoCashDiff) : autoCashDiff;
  const totalOutBasis = useMemo(() => goingOut.reduce((sum, g) => sum + (g.item.cost_basis ?? g.item.cost ?? 0), 0), [goingOut]);
  const newTotalBasis = parseFloat((totalOutBasis + cashDiff).toFixed(2));
  const perCardBasis = useMemo(() => comingIn.map((c) => {
    const share = tradeCreditTotal > 0 ? entryCredit(c) / tradeCreditTotal : 1 / comingIn.length;
    return parseFloat((newTotalBasis * share).toFixed(2));
  }), [comingIn, tradeCreditTotal, newTotalBasis]);
  const maxChainDepth = useMemo(() => goingOut.reduce((max, g) => Math.max(max, g.item.chain_depth ?? 0), 0), [goingOut]);

  // ── Handlers ──
  function toggleGoingOut(item: InventoryItem) {
    setGoingOut((prev) => {
      if (prev.find((g) => g.item.id === item.id)) return prev.filter((g) => g.item.id !== item.id);
      return [...prev, { item, tradeValue: item.market != null ? String(item.market) : "" }];
    });
  }
  function updateGoingOutValue(itemId: string, val: string) {
    setGoingOut((prev) => prev.map((g) => (g.item.id === itemId ? { ...g, tradeValue: val } : g)));
  }
  function updateComingIn(id: string, patch: Partial<ComingInEntry>) {
    setComingIn((prev) => prev.map((c) => (c._id === id ? { ...c, ...patch } : c)));
  }

  async function handleConfirm() {
    setError(null);
    if (goingOut.length === 0) { setError("Select at least one card going out"); return; }
    if (comingIn.some((c) => !c.name.trim())) { setError("All incoming cards need a name"); return; }
    if (comingIn.some((c) => !toNum(c.marketPrice))) { setError("All incoming cards need a market price"); return; }

    setBusy(true);
    try {
      await recordTrade({
        goingOut: goingOut.map((g) => ({ itemId: g.item.id, value: toNum(g.tradeValue) ?? g.item.market ?? 0 })),
        comingIn: comingIn.map((c) => ({
          name: c.name.trim(),
          set_name: c.setName.trim() || null,
          card_number: c.cardNumber.trim() || null,
          grade: c.grade.trim() || null,
          category: c.category,
          condition: c.condition,
          owner: c.owner,
          market: toNum(c.marketPrice) ?? 0,
        })),
        cashDifference: cashDiff,
        paid_by: paidBy,
        notes: notes.trim() || null,
        show_session_id: null,
        payment_method: Math.abs(cashDiff) < 0.005 ? "trade" : "cash",
      });
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trade failed");
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    setGoingOut([]);
    setComingIn([blankComingIn()]);
    setCashOverride("");
    setNotes("");
    setError(null);
    setOutSearch("");
    onClose();
  }

  if (!open) return null;

  const filteredItems = items.filter((it) => {
    const q = outSearch.trim().toLowerCase();
    return !q || it.name.toLowerCase().includes(q) || (it.set_name ?? "").toLowerCase().includes(q);
  });
  const cashTone = (v: number) => (v > 0.005 ? "text-negative" : v < -0.005 ? "text-positive" : "text-muted-foreground");

  return (
    <Modal open onClose={handleClose} title="Record trade" className="max-w-3xl max-h-full overflow-y-auto">
      <p className="-mt-2 mb-4 text-xs text-muted-foreground">Cost basis carries forward through the chain</p>
      <div className="space-y-6">
        {/* ── Cards going out ── */}
        <section>
          <h3 className={sectionLabel}>Cards going out</h3>
          <input className={`${fieldClass} mb-2`} placeholder="Search inventory…" value={outSearch} onChange={(e) => setOutSearch(e.target.value)} />
          <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {filteredItems.length === 0 && <div className="px-3 py-4 text-center text-xs text-muted-foreground">No items match</div>}
            {filteredItems.map((item) => {
              const selected = goingOut.find((g) => g.item.id === item.id);
              return (
                <div
                  key={item.id}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors duration-150 ${selected ? "bg-accent-primary-soft" : "hover:bg-muted"}`}
                  onClick={() => toggleGoingOut(item)}
                >
                  <input type="checkbox" readOnly checked={!!selected} className="h-5 w-5 shrink-0 accent-accent-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-foreground">{item.name}</div>
                    {(item.set_name || item.card_number || item.grade) && (
                      <div className="truncate text-xs text-muted-foreground">
                        {[item.set_name, item.card_number ? `#${item.card_number}` : "", item.grade].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 space-y-0.5 text-right text-xs tabular-nums">
                    <div className="text-foreground">{fmt(item.market)}</div>
                    {item.cost_basis != null && <div className="text-muted-foreground">basis {fmt(item.cost_basis)}</div>}
                    {item.chain_depth > 0 && <span className={pillClass}>T{item.chain_depth}</span>}
                  </div>
                  {selected && (
                    <label className="shrink-0" onClick={(e) => e.stopPropagation()}>
                      <span className={fieldLabel}>Trade at</span>
                      <input
                        className={`${fieldClass} w-24 text-right tabular-nums`}
                        value={selected.tradeValue}
                        inputMode="decimal"
                        placeholder={item.market != null ? String(item.market) : ""}
                        onChange={(e) => updateGoingOutValue(item.id, e.target.value)}
                      />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          {goingOut.length > 0 && (
            <div className="mt-2 text-right text-xs text-muted-foreground tabular-nums">
              Trade-out value <span className="font-semibold text-foreground">{fmt(tradeOutTotal)}</span>
              {totalOutBasis > 0 && <span className="ml-2">(cost basis {fmt(totalOutBasis)})</span>}
            </div>
          )}
        </section>

        {/* ── Cards coming in ── */}
        <section>
          <h3 className={sectionLabel}>Cards coming in</h3>
          <div className="space-y-3">
            {comingIn.map((card, idx) => (
              <TradeComingInCard
                key={card._id}
                card={card}
                index={idx}
                removable={comingIn.length > 1}
                onChange={(patch) => updateComingIn(card._id, patch)}
                onRemove={() => setComingIn((prev) => prev.filter((c) => c._id !== card._id))}
              />
            ))}
            <button className={`${btnOutline} w-full border-dashed`} onClick={() => setComingIn((prev) => [...prev, blankComingIn()])}>
              + Add another card
            </button>
            {tradeCreditTotal > 0 && (
              <div className="text-right text-xs text-muted-foreground tabular-nums">
                Trade credit <span className="font-semibold text-foreground">{fmt(tradeCreditTotal)}</span>
              </div>
            )}
          </div>
        </section>

        {/* ── Cash adjustment ── */}
        <section>
          <h3 className={sectionLabel}>Cash adjustment</h3>
          <div className="space-y-3 rounded-xl border border-border bg-card p-3">
            <div className="flex min-h-11 items-center justify-between text-sm">
              <span className="text-muted-foreground">Auto-calculated difference</span>
              <span className={`font-semibold tabular-nums ${cashTone(autoCashDiff)}`}>
                {autoCashDiff > 0.005 ? `−${fmt(autoCashDiff)} (vendor pays)` : autoCashDiff < -0.005 ? `+${fmt(Math.abs(autoCashDiff))} (vendor receives)` : "Even trade"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className={fieldLabel}>Cash paid by vendor (override)</span>
                <input className={`${fieldClass} tabular-nums`} placeholder={autoCashDiff > 0 ? fmt(autoCashDiff) : "0.00"} inputMode="decimal" value={cashOverride} onChange={(e) => setCashOverride(e.target.value)} />
              </label>
              <label className="block">
                <span className={fieldLabel}>Paid by</span>
                <select className={fieldClass} value={paidBy} onChange={(e) => setPaidBy(e.target.value as TradeOwner)}>
                  <option value="alex">Alex</option>
                  <option value="mila">Mila</option>
                  <option value="shared">Shared</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className={fieldLabel}>Notes</span>
              <input className={fieldClass} placeholder="Optional notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>
        </section>

        {/* ── Summary ── */}
        {goingOut.length > 0 && comingIn.some((c) => c.name.trim()) && (
          <section>
            <h3 className={sectionLabel}>Summary</h3>
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {goingOut.map((g) => (
                <div key={g.item.id} className="flex min-h-11 items-center justify-between px-3 py-2 text-sm">
                  <div><span className="mr-2 text-xs font-bold text-negative">OUT</span><span className="font-medium text-foreground">{g.item.name}</span></div>
                  <div className="text-right text-xs tabular-nums">
                    <div className="text-foreground">{fmt(toNum(g.tradeValue) ?? g.item.market)}</div>
                    <div className="text-muted-foreground">basis {fmt(g.item.cost_basis ?? g.item.cost)}</div>
                  </div>
                </div>
              ))}
              {comingIn.filter((c) => c.name.trim()).map((c, idx) => (
                <div key={c._id} className="flex min-h-11 items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <span className="mr-2 text-xs font-bold text-positive">IN</span>
                    <span className="font-medium text-foreground">{c.name || "—"}</span>
                    {c.grade && <span className="ml-2 text-xs text-muted-foreground">{c.grade}</span>}
                  </div>
                  <div className="text-right text-xs tabular-nums">
                    <div className="text-foreground">{fmt(toNum(c.marketPrice))} @ {c.tradePct}%</div>
                    <div className="font-semibold text-accent-primary">new basis {fmt(perCardBasis[idx])}</div>
                    <div className="text-muted-foreground">chain depth {maxChainDepth + 1}</div>
                  </div>
                </div>
              ))}
              <div className="flex min-h-11 items-center justify-between bg-muted px-3 py-2">
                <span className="text-xs text-muted-foreground">Cash {cashDiff > 0 ? "vendor pays" : cashDiff < 0 ? "vendor receives" : ""}</span>
                <span className={`text-sm font-bold ${cashTone(cashDiff)}`}>
                  {Math.abs(cashDiff) < 0.005 ? "Even" : <MoneyDisplay amount={-cashDiff} showSign tone={cashDiff > 0 ? "negative" : "positive"} />}
                </span>
              </div>
            </div>
          </section>
        )}

        {error && (
          <div className="rounded-lg border border-negative-border bg-negative-soft px-3 py-2 text-xs text-negative">{error}</div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button className={btnOutline} onClick={handleClose} disabled={busy}>Cancel</button>
          <button className={btnPrimary} onClick={handleConfirm} disabled={busy || goingOut.length === 0 || comingIn.every((c) => !c.name.trim())}>
            {busy ? "Recording…" : "Confirm trade"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

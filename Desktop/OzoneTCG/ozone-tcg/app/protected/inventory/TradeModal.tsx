"use client";

import { useState, useMemo, useId } from "react";
import { recordTrade } from "./actions";
import CertLookupWidget, { type CertWidgetResult } from "@/components/CertLookupWidget";

type Condition = "Near Mint" | "Lightly Played" | "Moderately Played" | "Heavily Played" | "Damaged";
type Owner = "alex" | "mila" | "shared";
type Category = "single" | "slab" | "sealed";

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

type ComingInEntry = {
  _id: string;
  name: string;
  setName: string;
  cardNumber: string;
  grade: string;
  category: Category;
  condition: Condition;
  owner: Owner;
  marketPrice: string;
  tradePct: string;
};

function blankComingIn(): ComingInEntry {
  return {
    _id: crypto.randomUUID(),
    name: "",
    setName: "",
    cardNumber: "",
    grade: "",
    category: "single",
    condition: "Near Mint",
    owner: "alex",
    marketPrice: "",
    tradePct: "80",
  };
}

function fmt(v: number | null | undefined) {
  if (v == null) return "—";
  return `$${v.toFixed(2)}`;
}

function toNum(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function TradeModal({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: InventoryItem[];
}) {
  const uid = useId();
  const [step, setStep] = useState<"build" | "confirm">("build");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cards going out
  const [outSearch, setOutSearch] = useState("");
  const [goingOut, setGoingOut] = useState<{ item: InventoryItem; tradeValue: string }[]>([]);

  // Cards coming in
  const [comingIn, setComingIn] = useState<ComingInEntry[]>([blankComingIn()]);

  // Cash adjustment
  const [cashOverride, setCashOverride] = useState<string>("");
  const [paidBy, setPaidBy] = useState<Owner>("alex");
  const [notes, setNotes] = useState("");

  // ── Derived values ──────────────────────────────────────────────────────────
  const tradeCreditTotal = useMemo(() =>
    comingIn.reduce((sum, c) => {
      const mp = toNum(c.marketPrice) ?? 0;
      const pct = toNum(c.tradePct) ?? 80;
      return sum + (mp * pct) / 100;
    }, 0),
    [comingIn]
  );

  const tradeOutTotal = useMemo(() =>
    goingOut.reduce((sum, g) => sum + (toNum(g.tradeValue) ?? g.item.market ?? 0), 0),
    [goingOut]
  );

  const autoCashDiff = parseFloat((tradeCreditTotal - tradeOutTotal).toFixed(2));
  const cashDiff = cashOverride.trim() !== "" ? (toNum(cashOverride) ?? autoCashDiff) : autoCashDiff;

  const totalOutBasis = useMemo(() =>
    goingOut.reduce((sum, g) => sum + (g.item.cost_basis ?? g.item.cost ?? 0), 0),
    [goingOut]
  );

  const newTotalBasis = parseFloat((totalOutBasis + cashDiff).toFixed(2));

  const perCardBasis = useMemo(() => {
    return comingIn.map((c) => {
      const mp = toNum(c.marketPrice) ?? 0;
      const pct = toNum(c.tradePct) ?? 80;
      const credit = (mp * pct) / 100;
      const share = tradeCreditTotal > 0 ? credit / tradeCreditTotal : 1 / comingIn.length;
      return parseFloat((newTotalBasis * share).toFixed(2));
    });
  }, [comingIn, tradeCreditTotal, newTotalBasis]);

  const maxChainDepth = useMemo(() =>
    goingOut.reduce((max, g) => Math.max(max, g.item.chain_depth ?? 0), 0),
    [goingOut]
  );

  // ── Handlers ────────────────────────────────────────────────────────────────
  function toggleGoingOut(item: InventoryItem) {
    setGoingOut((prev) => {
      const exists = prev.find((g) => g.item.id === item.id);
      if (exists) return prev.filter((g) => g.item.id !== item.id);
      return [...prev, { item, tradeValue: item.market != null ? String(item.market) : "" }];
    });
  }

  function updateGoingOutValue(itemId: string, val: string) {
    setGoingOut((prev) => prev.map((g) => g.item.id === itemId ? { ...g, tradeValue: val } : g));
  }

  function updateComingIn(id: string, patch: Partial<ComingInEntry>) {
    setComingIn((prev) => prev.map((c) => c._id === id ? { ...c, ...patch } : c));
  }

  function addComingIn() {
    setComingIn((prev) => [...prev, blankComingIn()]);
  }

  function removeComingIn(id: string) {
    setComingIn((prev) => prev.filter((c) => c._id !== id));
  }

  async function handleConfirm() {
    setError(null);
    if (goingOut.length === 0) { setError("Select at least one card going out"); return; }
    if (comingIn.some((c) => !c.name.trim())) { setError("All incoming cards need a name"); return; }
    if (comingIn.some((c) => !toNum(c.marketPrice))) { setError("All incoming cards need a market price"); return; }

    setBusy(true);
    try {
      await recordTrade({
        goingOut: goingOut.map((g) => ({
          itemId: g.item.id,
          tradeValue: toNum(g.tradeValue) ?? g.item.market ?? 0,
        })),
        comingIn: comingIn.map((c) => ({
          name: c.name.trim(),
          setName: c.setName.trim() || null,
          cardNumber: c.cardNumber.trim() || null,
          grade: c.grade.trim() || null,
          category: c.category,
          condition: c.condition,
          owner: c.owner,
          marketPrice: toNum(c.marketPrice) ?? 0,
          tradePct: toNum(c.tradePct) ?? 80,
        })),
        cashDifference: cashDiff,
        paidBy,
        notes: notes.trim() || null,
      });
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trade failed");
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    setStep("build");
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

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="bg-background border rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-base font-bold inv-label">Record Trade</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Cost basis carries forward through the chain</p>
          </div>
          <button className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none" onClick={handleClose}>×</button>
        </div>

        <div className="p-5 space-y-6">
          {/* SECTION 1 — Cards Going Out */}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-purple-500 dark:text-purple-400 mb-2 inv-label">Cards Going Out</h3>
            <input
              className="w-full border rounded-lg px-3 py-1.5 text-sm bg-background mb-2"
              placeholder="Search inventory…"
              value={outSearch}
              onChange={(e) => setOutSearch(e.target.value)}
            />
            <div className="max-h-48 overflow-y-auto divide-y border rounded-lg">
              {filteredItems.length === 0 && (
                <div className="px-3 py-4 text-xs text-center opacity-40">No items match</div>
              )}
              {filteredItems.map((item) => {
                const selected = goingOut.find((g) => g.item.id === item.id);
                const outEntry = selected;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors duration-100 text-sm ${selected ? "bg-purple-500/8" : "hover:bg-muted/40"}`}
                    onClick={() => toggleGoingOut(item)}
                  >
                    <input
                      type="checkbox"
                      readOnly
                      checked={!!selected}
                      className="w-4 h-4 accent-purple-600 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{item.name}</div>
                      {(item.set_name || item.card_number || item.grade) && (
                        <div className="text-xs opacity-50 truncate">
                          {[item.set_name, item.card_number ? `#${item.card_number}` : "", item.grade].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0 space-y-0.5">
                      <div className="text-xs inv-price">{fmt(item.market)}</div>
                      {item.cost_basis != null && (
                        <div className="text-[10px] opacity-40 inv-price">basis {fmt(item.cost_basis)}</div>
                      )}
                      {item.chain_depth > 0 && (
                        <div className="text-[10px] text-amber-500">T{item.chain_depth}</div>
                      )}
                    </div>
                    {selected && (
                      <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <div className="text-[10px] opacity-50 mb-0.5">Trade at</div>
                        <input
                          className="w-20 border rounded px-1.5 py-0.5 text-xs text-right bg-background inv-price"
                          value={outEntry!.tradeValue}
                          inputMode="decimal"
                          placeholder={item.market != null ? String(item.market) : ""}
                          onChange={(e) => updateGoingOutValue(item.id, e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {goingOut.length > 0 && (
              <div className="mt-1.5 text-xs text-right opacity-60 inv-price">
                Total trade-out value: <span className="font-semibold">{fmt(tradeOutTotal)}</span>
                {totalOutBasis > 0 && <span className="ml-2 opacity-60">(cost basis: {fmt(totalOutBasis)})</span>}
              </div>
            )}
          </section>

          {/* SECTION 2 — Cards Coming In */}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-blue-500 dark:text-blue-400 mb-2 inv-label">Cards Coming In</h3>
            <div className="space-y-3">
              {comingIn.map((card, idx) => {
                const mp = toNum(card.marketPrice) ?? 0;
                const pct = toNum(card.tradePct) ?? 80;
                const credit = (mp * pct) / 100;
                return (
                  <div key={card._id} className="border rounded-xl p-3 space-y-2.5 bg-muted/20">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold opacity-60">Card {idx + 1}</span>
                      <div className="flex items-center gap-2">
                        <CertLookupWidget
                          label="Scan cert"
                          onResult={(r: CertWidgetResult) => {
                            updateComingIn(card._id, {
                              name: r.name,
                              setName: r.setName ?? "",
                              cardNumber: r.cardNumber ?? "",
                              grade: r.gradeLabel ? `${r.company} ${r.gradeLabel} ${r.grade}` : r.grade ? `${r.company} ${r.grade}` : "",
                              category: "slab",
                              marketPrice: r.market != null ? String(r.market) : "",
                            });
                          }}
                        />
                        {comingIn.length > 1 && (
                          <button className="text-xs text-red-500 hover:opacity-80" onClick={() => removeComingIn(card._id)}>Remove</button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="col-span-2 border rounded-lg px-3 py-1.5 text-sm bg-background"
                        placeholder="Card name *"
                        value={card.name}
                        onChange={(e) => updateComingIn(card._id, { name: e.target.value })}
                      />
                      <input
                        className="border rounded-lg px-3 py-1.5 text-sm bg-background"
                        placeholder="Set name"
                        value={card.setName}
                        onChange={(e) => updateComingIn(card._id, { setName: e.target.value })}
                      />
                      <input
                        className="border rounded-lg px-3 py-1.5 text-sm bg-background"
                        placeholder="Card #"
                        value={card.cardNumber}
                        onChange={(e) => updateComingIn(card._id, { cardNumber: e.target.value })}
                      />
                      <select
                        className="border rounded-lg px-3 py-1.5 text-sm bg-background"
                        value={card.category}
                        onChange={(e) => updateComingIn(card._id, { category: e.target.value as Category })}
                      >
                        <option value="single">Single</option>
                        <option value="slab">Slab</option>
                        <option value="sealed">Sealed</option>
                      </select>
                      {card.category === "slab" ? (
                        <input
                          className="border rounded-lg px-3 py-1.5 text-sm bg-background"
                          placeholder="Grade (e.g. PSA 10)"
                          value={card.grade}
                          onChange={(e) => updateComingIn(card._id, { grade: e.target.value })}
                        />
                      ) : (
                        <select
                          className="border rounded-lg px-3 py-1.5 text-sm bg-background"
                          value={card.condition}
                          onChange={(e) => updateComingIn(card._id, { condition: e.target.value as Condition })}
                        >
                          {(["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"] as Condition[]).map((c) => (
                            <option key={c} value={c}>{{ "Near Mint": "NM", "Lightly Played": "LP", "Moderately Played": "MP", "Heavily Played": "HP", "Damaged": "DMG" }[c]}</option>
                          ))}
                        </select>
                      )}
                      <select
                        className="border rounded-lg px-3 py-1.5 text-sm bg-background"
                        value={card.owner}
                        onChange={(e) => updateComingIn(card._id, { owner: e.target.value as Owner })}
                      >
                        <option value="alex">Alex</option>
                        <option value="mila">Mila</option>
                        <option value="shared">Shared</option>
                      </select>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] uppercase tracking-wider opacity-50 font-semibold block mb-1">Market price</label>
                        <input
                          className="w-full border rounded-lg px-3 py-1.5 text-sm bg-background inv-price"
                          placeholder="$0.00"
                          inputMode="decimal"
                          value={card.marketPrice}
                          onChange={(e) => updateComingIn(card._id, { marketPrice: e.target.value })}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] uppercase tracking-wider opacity-50 font-semibold block mb-1">Trade %</label>
                        <input
                          className="w-full border rounded-lg px-3 py-1.5 text-sm bg-background inv-price"
                          placeholder="80"
                          inputMode="decimal"
                          value={card.tradePct}
                          onChange={(e) => updateComingIn(card._id, { tradePct: e.target.value })}
                        />
                      </div>
                      <div className="flex-1 pb-1.5">
                        <div className="text-[10px] uppercase tracking-wider opacity-50 font-semibold mb-1">Credit</div>
                        <div className={`text-sm font-bold inv-price ${mp > 0 ? "text-blue-500" : "opacity-30"}`}>
                          {mp > 0 ? fmt(credit) : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <button
                className="w-full border border-dashed rounded-xl py-2 text-xs opacity-50 hover:opacity-80 transition-opacity"
                onClick={addComingIn}
              >
                + Add another card
              </button>
              {tradeCreditTotal > 0 && (
                <div className="text-xs text-right opacity-60 inv-price">
                  Total trade credit: <span className="font-semibold">{fmt(tradeCreditTotal)}</span>
                </div>
              )}
            </div>
          </section>

          {/* SECTION 3 — Cash Adjustment */}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider opacity-50 mb-2 inv-label">Cash Adjustment</h3>
            <div className="border rounded-xl p-3 bg-muted/20 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="opacity-60">Auto-calculated difference</span>
                <span className={`font-semibold inv-price ${autoCashDiff > 0.005 ? "text-red-500" : autoCashDiff < -0.005 ? "text-green-500" : "opacity-60"}`}>
                  {autoCashDiff > 0.005 ? `−${fmt(autoCashDiff)} (vendor pays)` : autoCashDiff < -0.005 ? `+${fmt(Math.abs(autoCashDiff))} (vendor receives)` : "Even trade"}
                </span>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="text-[10px] uppercase tracking-wider opacity-50 font-semibold block mb-1">
                    Override cash paid by vendor (leave blank to use auto)
                  </label>
                  <input
                    className="w-full border rounded-lg px-3 py-1.5 text-sm bg-background inv-price"
                    placeholder={autoCashDiff > 0 ? fmt(autoCashDiff) : "0.00"}
                    inputMode="decimal"
                    value={cashOverride}
                    onChange={(e) => setCashOverride(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] uppercase tracking-wider opacity-50 font-semibold block mb-1">Paid by</label>
                  <select
                    className="w-full border rounded-lg px-3 py-1.5 text-sm bg-background"
                    value={paidBy}
                    onChange={(e) => setPaidBy(e.target.value as Owner)}
                  >
                    <option value="alex">Alex</option>
                    <option value="mila">Mila</option>
                    <option value="shared">Shared</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider opacity-50 font-semibold block mb-1">Notes</label>
                <input
                  className="w-full border rounded-lg px-3 py-1.5 text-sm bg-background"
                  placeholder="Optional notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* SECTION 4 — Summary */}
          {goingOut.length > 0 && comingIn.some((c) => c.name.trim()) && (
            <section>
              <h3 className="text-[11px] font-bold uppercase tracking-wider opacity-50 mb-2 inv-label">Summary</h3>
              <div className="border rounded-xl divide-y overflow-hidden">
                {goingOut.map((g) => (
                  <div key={g.item.id} className="flex items-center justify-between px-3 py-2 text-sm bg-red-500/4">
                    <div>
                      <span className="text-red-500 text-xs font-bold mr-1.5">OUT</span>
                      <span className="font-medium">{g.item.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="inv-price text-xs">{fmt(toNum(g.tradeValue) ?? g.item.market)}</div>
                      <div className="text-[10px] opacity-40 inv-price">basis {fmt(g.item.cost_basis ?? g.item.cost)}</div>
                    </div>
                  </div>
                ))}
                {comingIn.filter((c) => c.name.trim()).map((c, idx) => (
                  <div key={c._id} className="flex items-center justify-between px-3 py-2 text-sm bg-green-500/4">
                    <div>
                      <span className="text-green-500 text-xs font-bold mr-1.5">IN</span>
                      <span className="font-medium">{c.name || "—"}</span>
                      {c.grade && <span className="text-xs opacity-50 ml-1.5">{c.grade}</span>}
                    </div>
                    <div className="text-right">
                      <div className="inv-price text-xs">{fmt(toNum(c.marketPrice))} @ {c.tradePct}%</div>
                      <div className="text-[10px] text-blue-500 inv-price font-semibold">new basis {fmt(perCardBasis[idx])}</div>
                      <div className="text-[10px] opacity-40">chain depth {maxChainDepth + 1}</div>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2.5 bg-muted/30">
                  <span className="text-xs opacity-60">Cash {cashDiff > 0 ? "vendor pays" : cashDiff < 0 ? "vendor receives" : ""}</span>
                  <span className={`text-sm font-bold inv-price ${cashDiff > 0.005 ? "text-red-500" : cashDiff < -0.005 ? "text-green-500" : "opacity-50"}`}>
                    {Math.abs(cashDiff) < 0.005 ? "Even" : (cashDiff > 0 ? "−" : "+") + fmt(Math.abs(cashDiff))}
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* Error */}
          {error && (
            <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-1">
            <button
              className="px-4 py-2 text-sm rounded-lg border hover:bg-muted transition-colors"
              onClick={handleClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="px-5 py-2 text-sm rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold transition-colors disabled:opacity-50"
              onClick={handleConfirm}
              disabled={busy || goingOut.length === 0 || comingIn.every((c) => !c.name.trim())}
            >
              {busy ? "Recording…" : "Confirm Trade"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

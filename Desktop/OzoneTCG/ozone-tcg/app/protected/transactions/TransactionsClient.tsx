"use client";

import React, { useState, useMemo, useRef } from "react";
import { ArrowDown, DollarSign, ArrowLeftRight, Folder } from "lucide-react";
import type { SaleGroup, BuyExpense, TradeGroup, DealLog } from "./TransactionsServer";
import { revertSale, recordQuickBuy, recordQuickSell, deleteBuyExpense, revertTrade, type QuickBuyCard } from "./actions";
import { uploadDealPhoto, createDealLog, toggleDealResolved, deleteDealLog } from "../photos/actions";
import TradeModal from "../inventory/TradeModal";
import CertLookupWidget, { type CertWidgetResult } from "@/components/CertLookupWidget";
import ConfirmationModal from "@/components/ConfirmationModal";

// ─── types ────────────────────────────────────────────────────────────────────

type Tab = "all" | "buys" | "sells" | "trades" | "deals";
type DealType = "buy" | "sell" | "trade";

type InventoryItem = {
  id: string;
  name: string;
  set_name: string | null;
  card_number: string | null;
  grade: string | null;
  category: string;
  condition: string;
  owner: string;
  market: number | null;
  cost: number | null;
  cost_basis: number | null;
  chain_depth: number;
  original_cash_invested: number | null;
  acquisition_type: string | null;
};

const DEAL_COLORS: Record<DealType, string> = {
  buy:   "bg-blue-500/15 text-blue-400 border-blue-500/30",
  sell:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  trade: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};
const DEAL_LABELS: Record<DealType, string> = { buy: "Buy", sell: "Sell", trade: "Trade" };

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Split a search query into normalised terms (strips punctuation). */
function splitTerms(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[',\-.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t.length > 0);
}

/** Score an InventoryItem against a set of search terms. */
function scoreItem(item: InventoryItem, terms: string[]): number {
  if (!terms.length) return 1;
  const name  = item.name.toLowerCase();
  const set   = (item.set_name   ?? "").toLowerCase();
  const num   = (item.card_number ?? "").toLowerCase().replace(/^0+/, "");
  const grade = (item.grade ?? "").toLowerCase();
  let score = 0;
  for (const term of terms) {
    const numTerm = term.replace(/^0+/, "");
    if (name.includes(term))                                          score += 3;
    if (set.includes(term))                                           score += 2;
    if (numTerm && num === numTerm)                                   score += 4;
    else if (numTerm && /^\d/.test(numTerm) && num.startsWith(numTerm)) score += 3;
    if (grade.includes(term))                                         score += 1;
  }
  return score;
}

/** Highlight matched terms in a string with a violet accent span. */
function HighlightTerms({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  for (const term of terms) {
    let idx = lower.indexOf(term);
    while (idx !== -1) {
      ranges.push([idx, idx + term.length]);
      idx = lower.indexOf(term, idx + 1);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of ranges) {
    if (merged.length && s <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    } else {
      merged.push([s, e]);
    }
  }
  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const [s, e] of merged) {
    if (pos < s) parts.push(<span key={`t${pos}`}>{text.slice(pos, s)}</span>);
    parts.push(<span key={`h${s}`} className="text-violet-400 font-semibold">{text.slice(s, e)}</span>);
    pos = e;
  }
  if (pos < text.length) parts.push(<span key={`t${pos}`}>{text.slice(pos)}</span>);
  return <>{parts}</>;
}

function fmt(v: number | null | undefined) {
  if (v == null) return "—";
  return `$${v.toFixed(2)}`;
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function profitColor(v: number) {
  if (v > 0) return "text-emerald-500";
  if (v < 0) return "text-red-500";
  return "text-muted-foreground";
}

// ─── Record Buy Modal ─────────────────────────────────────────────────────────

type Condition = "Near Mint" | "Lightly Played" | "Moderately Played" | "Heavily Played" | "Damaged";
const CONDITIONS: Condition[] = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];
const COND_ABBR: Record<Condition, string> = {
  "Near Mint": "NM", "Lightly Played": "LP", "Moderately Played": "MP",
  "Heavily Played": "HP", "Damaged": "DMG",
};
type Category = "single" | "slab" | "sealed";

function blankCard(): QuickBuyCard & { _id: string } {
  return { _id: crypto.randomUUID(), name: "", condition: "Near Mint", market: 0, category: "single" };
}

function RecordBuyModal({ onClose }: { onClose: () => void }) {
  const [paidBy, setPaidBy] = useState<"alex" | "mila" | "shared">("shared");
  const [paymentType, setPaymentType] = useState<string>("cash");
  const [addToInventory, setAddToInventory] = useState(true);
  const [cards, setCards] = useState<(QuickBuyCard & { _id: string })[]>([blankCard()]);
  const [totalCostStr, setTotalCostStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totalMarket = cards.reduce((s, c) => s + (c.market || 0), 0);
  const totalCost = parseFloat(totalCostStr) || 0;

  function updateCard(id: string, patch: Partial<QuickBuyCard>) {
    setCards((cs) => cs.map((c) => (c._id === id ? { ...c, ...patch } : c)));
  }

  async function handleSubmit() {
    if (cards.length === 0) { setErr("Add at least one card"); return; }
    if (totalCost <= 0) { setErr("Total cost must be > 0"); return; }
    setBusy(true);
    setErr(null);
    try {
      await recordQuickBuy({
        cards: cards.map(({ _id: _, ...c }) => c),
        totalCost,
        paidBy,
        paymentType,
        addToInventory,
      });
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center modal-backdrop p-4">
      <div className="modal-panel w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold inv-label">Record Buy</h2>
          <button onClick={onClose} className="modal-close-btn">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Cards */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] uppercase tracking-wider opacity-40 font-semibold">Cards</label>
              <CertLookupWidget
                onResult={(r: CertWidgetResult) => {
                  const newCard = {
                    _id: crypto.randomUUID(),
                    name: r.name,
                    condition: "Near Mint" as Condition,
                    market: r.market ?? 0,
                    category: "slab" as Category,
                    grade: r.gradeLabel ? `${r.company} ${r.gradeLabel} ${r.grade}` : r.grade ? `${r.company} ${r.grade}` : "",
                    set_name: r.setName ?? "",
                    card_number: r.cardNumber ?? "",
                  };
                  // Replace the single blank card instead of appending
                  setCards((cs) =>
                    cs.length === 1 && !cs[0].name ? [newCard] : [...cs, newCard]
                  );
                  if (r.market && !totalCostStr) setTotalCostStr(r.market.toFixed(2));
                }}
              />
            </div>

            {cards.map((card) => (
              <div key={card._id} className="border border-border rounded-xl p-3 space-y-2 bg-muted/10">
                {/* Row 1: name + market + remove */}
                <div className="flex gap-2 items-center">
                  <input
                    className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-violet-500"
                    placeholder="Card name *"
                    value={card.name}
                    onChange={(e) => updateCard(card._id, { name: e.target.value })}
                  />
                  <input
                    type="number" min="0" step="0.01"
                    className="w-20 bg-background border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-violet-500 inv-price"
                    placeholder="Mkt $"
                    value={card.market || ""}
                    onChange={(e) => updateCard(card._id, { market: parseFloat(e.target.value) || 0 })}
                  />
                  {cards.length > 1 && (
                    <button onClick={() => setCards((cs) => cs.filter((c) => c._id !== card._id))}
                      className="text-muted-foreground hover:text-red-500 transition-colors text-sm shrink-0">✕</button>
                  )}
                </div>
                {/* Row 2: category + condition + grade (slab only) */}
                <div className="flex gap-2 flex-wrap">
                  <select
                    className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-violet-500"
                    value={card.category ?? "single"}
                    onChange={(e) => updateCard(card._id, { category: e.target.value as Category })}
                  >
                    <option value="single">Single</option>
                    <option value="slab">Slab</option>
                    <option value="sealed">Sealed</option>
                  </select>
                  <select
                    className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-violet-500"
                    value={card.condition}
                    onChange={(e) => updateCard(card._id, { condition: e.target.value as Condition })}
                  >
                    {CONDITIONS.map((c) => <option key={c} value={c}>{COND_ABBR[c]}</option>)}
                  </select>
                  {card.category === "slab" && (
                    <input
                      className="w-24 bg-background border border-border rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-violet-500"
                      placeholder="Grade (PSA 10)"
                      value={card.grade ?? ""}
                      onChange={(e) => updateCard(card._id, { grade: e.target.value })}
                    />
                  )}
                </div>
                {/* Row 3: set + card number */}
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-background border border-border rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-violet-500"
                    placeholder="Set name"
                    value={card.set_name ?? ""}
                    onChange={(e) => updateCard(card._id, { set_name: e.target.value })}
                  />
                  <input
                    className="w-24 bg-background border border-border rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-violet-500"
                    placeholder="Card #"
                    value={card.card_number ?? ""}
                    onChange={(e) => updateCard(card._id, { card_number: e.target.value })}
                  />
                </div>
              </div>
            ))}
            <button onClick={() => setCards((cs) => [...cs, blankCard()])}
              className="text-xs text-violet-500 hover:text-violet-400 transition-colors">+ Add card</button>
          </div>

          {/* Total cost */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] uppercase tracking-wider opacity-40 font-semibold">Total Cost Paid</label>
              {totalMarket > 0 && totalCost > 0 && (
                <span className="text-[11px] opacity-50 inv-price">
                  {((totalCost / totalMarket) * 100).toFixed(0)}% of {fmt(totalMarket)} market
                </span>
              )}
            </div>
            <input
              type="number" min="0" step="0.01"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500 inv-price"
              placeholder="0.00"
              value={totalCostStr}
              onChange={(e) => setTotalCostStr(e.target.value)}
            />
          </div>

          {/* Paid by + payment type */}
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-[11px] uppercase tracking-wider opacity-40 font-semibold">Paid By</label>
              <select className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500"
                value={paidBy} onChange={(e) => setPaidBy(e.target.value as "alex" | "mila" | "shared")}>
                <option value="shared">Shared</option>
                <option value="alex">Alex</option>
                <option value="mila">Mila</option>
              </select>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-[11px] uppercase tracking-wider opacity-40 font-semibold">Payment</label>
              <select className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500"
                value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="venmo">Venmo</option>
                <option value="paypal">PayPal</option>
                <option value="trade">Trade</option>
                <option value="">Other</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={addToInventory}
              onChange={(e) => setAddToInventory(e.target.checked)} className="accent-violet-500 w-4 h-4" />
            <span className="text-sm">Add cards to inventory</span>
          </label>

          {err && <p className="text-sm text-red-500">{err}</p>}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="modal-btn-ghost flex-1">Cancel</button>
          <button onClick={handleSubmit} disabled={busy} className="modal-btn-primary flex-1">
            {busy ? "Saving…" : "Record Buy"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Record Sell Modal ────────────────────────────────────────────────────────

function RecordSellModal({
  inventoryItems,
  onClose,
}: {
  inventoryItems: InventoryItem[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [priceStr, setPriceStr] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const terms = splitTerms(search);
  const filtered = terms.length
    ? inventoryItems
        .map((it) => ({ it, score: scoreItem(it, terms) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ it }) => it)
        .slice(0, 20)
    : inventoryItems.slice(0, 20);

  const selected = inventoryItems.find((it) => it.id === selectedId) ?? null;
  const sellPrice = parseFloat(priceStr) || 0;
  const cost = selected ? (selected.cost_basis ?? selected.cost ?? null) : null;
  const profit = sellPrice > 0 && cost != null ? sellPrice - cost : null;
  const profitPct = profit != null && cost != null && cost > 0 ? (profit / cost) * 100 : null;

  async function handleSubmit() {
    if (!selectedId) { setErr("Select a card to sell"); return; }
    if (sellPrice <= 0) { setErr("Enter a sell price"); return; }
    setBusy(true); setErr(null);
    try {
      await recordQuickSell({ itemIds: [selectedId], totalPrice: sellPrice, notes: notes.trim() || null });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center modal-backdrop p-4">
      <div className="modal-panel w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold inv-label">Record Sell</h2>
          <button onClick={onClose} className="modal-close-btn">✕</button>
        </div>
        <div className="p-5 space-y-4">
          {/* Card search */}
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wider opacity-40 font-semibold">Card</label>
            {selected ? (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/6">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{selected.name}</div>
                  <div className="text-xs opacity-50">{[selected.set_name, selected.card_number ? `#${selected.card_number}` : null, selected.grade].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="text-right text-xs inv-price opacity-60 shrink-0">
                  {selected.market != null && <div>Mkt {fmt(selected.market)}</div>}
                  {cost != null && <div>Cost {fmt(cost)}</div>}
                </div>
                <button onClick={() => { setSelectedId(null); setPriceStr(""); }} className="text-xs opacity-40 hover:opacity-70 ml-1">✕</button>
              </div>
            ) : (
              <div className="space-y-1">
                <input
                  autoFocus
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500"
                  placeholder="Search by name, set, or card number…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {filtered.length > 0 && (
                  <div className="border border-border rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    {filtered.map((it) => (
                      <button
                        key={it.id}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/5 transition-colors border-b border-border/30 last:border-0"
                        onClick={() => {
                          setSelectedId(it.id);
                          setPriceStr(it.market?.toFixed(2) ?? "");
                          setSearch("");
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">
                            <HighlightTerms text={it.name} terms={terms} />
                          </div>
                          <div className="text-[11px] opacity-40">
                            <HighlightTerms text={[it.set_name ?? it.category, it.card_number ? `#${it.card_number}` : null, it.grade].filter(Boolean).join(" · ")} terms={terms} />
                          </div>
                        </div>
                        {it.market != null && <span className="text-xs inv-price opacity-50 shrink-0">{fmt(it.market)}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sell price */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] uppercase tracking-wider opacity-40 font-semibold">Sell Price</label>
              {selected?.market != null && <span className="text-[11px] opacity-40 inv-price">Market {fmt(selected.market)}</span>}
            </div>
            <input
              type="number" min="0" step="0.01"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-emerald-500 inv-price"
              placeholder="0.00"
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value)}
            />
          </div>

          {/* Profit preview */}
          {profit != null && selected && (
            <div className={`rounded-xl px-4 py-3 border text-sm space-y-0.5 ${profit >= 0 ? "bg-emerald-500/6 border-emerald-500/20" : "bg-red-500/6 border-red-500/20"}`}>
              <div className="text-[11px] uppercase tracking-wider opacity-40 font-semibold mb-1.5">Summary</div>
              <div className="flex justify-between inv-price">
                <span className="opacity-60">Sell price</span>
                <span>{fmt(sellPrice)}</span>
              </div>
              <div className="flex justify-between inv-price">
                <span className="opacity-60">Cost basis</span>
                <span className="opacity-70">{fmt(cost)}</span>
              </div>
              <div className={`flex justify-between font-semibold inv-price border-t border-border/40 pt-1.5 mt-1.5 ${profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                <span>Profit</span>
                <span>{profit >= 0 ? "+" : ""}{fmt(profit)}{profitPct != null ? ` (${profitPct >= 0 ? "+" : ""}${profitPct.toFixed(0)}%)` : ""}</span>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wider opacity-40 font-semibold">Notes <span className="opacity-50 normal-case tracking-normal">(optional)</span></label>
            <input
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500"
              placeholder="Buyer, platform, notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {err && <p className="text-sm text-red-500">{err}</p>}
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="modal-btn-ghost flex-1">Cancel</button>
          <button onClick={handleSubmit} disabled={busy} className="modal-btn-confirm flex-1">
            {busy ? "Saving…" : "Record Sell"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Row components ───────────────────────────────────────────────────────────

function BuyRow({ expense, onDelete }: { expense: BuyExpense; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const itemCount = expense.items.length;
  const label = itemCount > 0
    ? (itemCount === 1 ? expense.items[0].name : `${itemCount} card${itemCount !== 1 ? "s" : ""}`)
    : expense.description;

  return (
    <div className="rounded-lg overflow-hidden inv-row-buy">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors duration-150 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="w-14 shrink-0 flex flex-col gap-0.5">
          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold font-mono bg-blue-500/15 text-blue-500">BUY</span>
          {expense.show_session_id && (
            <span className="text-[8px] px-1 py-0.5 rounded font-bold bg-amber-400/15 text-amber-500">SHOW</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold inv-label truncate">{label}</div>
          <div className="text-xs opacity-50 mt-0.5">
            {expense.paid_by && <span>{expense.paid_by}</span>}
            {expense.payment_type && <span className="ml-1">· {expense.payment_type}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="text-sm font-semibold inv-price text-red-400">{fmt(expense.cost)}</div>
            <div className="text-[11px] opacity-50">{fmtDate(expense.created_at)}</div>
          </div>
          {itemCount > 0 && (
            <span className="text-[10px] opacity-30">{expanded ? "▲" : "▼"}</span>
          )}
        </div>
      </button>

      {expanded && itemCount > 0 && (
        <div className="border-t border-border/50">
          {expense.items.map((item, i) => (
            <div key={item.id} className={`flex items-center justify-between px-4 py-2.5 text-sm gap-3 ${i > 0 ? "border-t border-border/30" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{item.name}</div>
                <div className="text-xs opacity-50">
                  {item.grade && <span>{item.grade}</span>}
                  {item.set_name && <span className="ml-1">· {item.set_name}</span>}
                  {item.card_number && <span className="ml-1">#{item.card_number}</span>}
                  {item.status === "sold" && <span className="ml-1 text-emerald-500/70">· sold</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                {item.market != null && (
                  <div className="text-xs opacity-50 inv-price">mkt {fmt(item.market)}</div>
                )}
              </div>
            </div>
          ))}
          <div className="border-t border-border/50 px-4 py-2 flex items-center justify-between">
            <span className="text-xs opacity-50">Total paid</span>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold inv-price text-red-400">{fmt(expense.cost)}</span>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                className="text-[11px] px-2 py-1 rounded border border-border opacity-50 hover:opacity-80 hover:text-red-500 transition-all"
              >Delete</button>
            </div>
          </div>
        </div>
      )}

      {expanded && itemCount === 0 && (
        <div className="border-t border-border/50 px-4 py-3 flex items-center justify-between">
          <span className="text-xs opacity-40 italic">No inventory items linked</span>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
            className="text-[11px] px-2 py-1 rounded border border-border opacity-50 hover:opacity-80 hover:text-red-500 transition-all"
          >Delete</button>
        </div>
      )}

      {confirmDelete && (
        <ConfirmationModal
          title="Delete this buy?"
          description="Inventory items added by this buy will also be removed."
          confirmLabel="Delete buy"
          destructive
          onConfirm={() => { setConfirmDelete(false); onDelete(expense.id); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

function SellRow({
  sale,
  onRevert,
}: {
  sale: SaleGroup;
  onRevert: (saleId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isSingle = sale.items.length === 1;
  const profit = sale.totalCost > 0 ? sale.total - sale.totalCost : null;

  return (
    <div className="rounded-lg overflow-hidden inv-row-sell">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors duration-150 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="w-14 shrink-0">
          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold font-mono bg-emerald-500/15 text-emerald-500">SELL</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold inv-label truncate">
            {isSingle ? sale.items[0].name : `${sale.items.length} items`}
          </div>
          <div className="text-xs opacity-50 mt-0.5">
            {sale.items.map((it) => it.category).filter((v, i, a) => a.indexOf(v) === i).join(" · ")}
            {!isSingle && <span className="ml-2">· {sale.items.length} cards</span>}
          </div>
        </div>
        <div className="text-right shrink-0 flex items-center gap-3">
          <div>
            <div className="text-sm font-semibold inv-price text-emerald-500">{fmt(sale.total)}</div>
            {profit != null && (
              <div className={`text-[11px] inv-price ${profitColor(profit)}`}>
                {profit >= 0 ? "+" : ""}{fmt(profit)}
              </div>
            )}
          </div>
          <div className="text-[11px] opacity-40">{fmtDate(sale.soldAt)}</div>
          <span className="text-[10px] opacity-30">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/50">
          {sale.items.map((it, i) => (
            <div key={it.id} className={`flex items-center justify-between px-4 py-2.5 text-sm gap-3 ${i > 0 ? "border-t border-border/30" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{it.name}</div>
                <div className="text-xs opacity-50 capitalize">{COND_ABBR[it.condition as Condition] ?? it.condition} · {it.category}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="inv-price text-emerald-500 font-semibold">{fmt(it.sold_price)}</div>
                {it.cost != null && (
                  <div className="text-xs opacity-50 inv-price">cost {fmt(it.cost_basis ?? it.cost)}</div>
                )}
              </div>
            </div>
          ))}
          <div className="border-t border-border/50 px-4 py-2 flex items-center justify-between">
            <span className="text-xs opacity-50">Sale total</span>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold inv-price text-emerald-500">{fmt(sale.total)}</span>
              <button
                onClick={() => onRevert(sale.saleId)}
                className="text-[11px] px-2 py-1 rounded border border-border opacity-50 hover:opacity-80 transition-opacity"
              >Revert</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TradeRow({ trade, onRevert }: { trade: TradeGroup; onRevert: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const outTotal = trade.goingOut.reduce((s, t) => s + (t.market_price_at_time ?? 0), 0);
  const inTotal = trade.comingIn.reduce((s, t) => s + (t.market_price_at_time ?? 0), 0);

  return (
    <div className="rounded-lg overflow-hidden inv-row-trade">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors duration-150 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="w-14 shrink-0">
          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold font-mono bg-amber-500/15 text-amber-500">TRADE</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold inv-label">
            {trade.goingOut.length} out → {trade.comingIn.length} in
          </div>
          <div className="text-xs opacity-50 mt-0.5 truncate">
            {trade.goingOut.map((t) => t.card_name).filter(Boolean).join(", ") || "—"}
            {" → "}
            {trade.comingIn.map((t) => t.card_name).filter(Boolean).join(", ") || "manual entry"}
          </div>
        </div>
        <div className="text-right shrink-0 flex items-center gap-3">
          <div>
            {trade.cashDiff !== 0 && (
              <div className={`text-sm font-semibold inv-price ${trade.cashDiff > 0 ? "text-red-400" : "text-emerald-500"}`}>
                {trade.cashDiff > 0 ? `+${fmt(trade.cashDiff)} cash` : `${fmt(Math.abs(trade.cashDiff))} rcvd`}
              </div>
            )}
            <div className="text-[11px] opacity-50 inv-price">
              {outTotal > 0 && `${fmt(outTotal)} out`}
              {outTotal > 0 && inTotal > 0 && " · "}
              {inTotal > 0 && `${fmt(inTotal)} in`}
            </div>
          </div>
          <div className="text-[11px] opacity-40">{fmtDate(trade.date)}</div>
          <span className="text-[10px] opacity-30">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/50 px-4 py-3 space-y-3 text-sm">
          {trade.goingOut.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider opacity-40 font-semibold mb-1">Going Out</div>
              {trade.goingOut.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-1 gap-3">
                  <span className="text-sm">{t.card_name ?? "—"}</span>
                  <span className="inv-price opacity-70">{fmt(t.market_price_at_time)}</span>
                </div>
              ))}
            </div>
          )}
          {trade.comingIn.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider opacity-40 font-semibold mb-1">Coming In</div>
              {trade.comingIn.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-1 gap-3">
                  <div>
                    <span className="text-sm">{t.card_name ?? "—"}</span>
                    {t.cost_basis != null && (
                      <span className="text-xs opacity-50 ml-2 inv-price">basis {fmt(t.cost_basis)}</span>
                    )}
                  </div>
                  <span className="inv-price opacity-70">{fmt(t.market_price_at_time)}</span>
                </div>
              ))}
            </div>
          )}
          {trade.notes && (
            <div className="text-xs opacity-50 italic">{trade.notes}</div>
          )}
          <div className="border-t border-border/50 pt-2 flex justify-end">
            <button
              onClick={() => setConfirmRevert(true)}
              className="text-[11px] px-2 py-1 rounded border border-border opacity-50 hover:opacity-80 hover:text-red-500 transition-all"
            >Undo trade</button>
          </div>
        </div>
      )}

      {confirmRevert && (
        <ConfirmationModal
          title="Undo this trade?"
          description="Cards that went out will be restored to inventory. Cards that came in will be removed."
          confirmLabel="Undo trade"
          destructive
          onConfirm={() => { setConfirmRevert(false); onRevert(trade.tradeGroupId); }}
          onCancel={() => setConfirmRevert(false)}
        />
      )}
    </div>
  );
}

// ─── Deal Lightbox ────────────────────────────────────────────────────────────

function DealLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/92 p-4"
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Full size" className="max-w-full max-h-full object-contain rounded-xl" />
    </div>
  );
}

// ─── View Deal Modal ──────────────────────────────────────────────────────────

function ViewDealModal({
  log,
  onClose,
  onToggleResolved,
  onDelete,
}: {
  log: DealLog;
  onClose: () => void;
  onToggleResolved: () => void;
  onDelete: () => void;
}) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center modal-backdrop pb-16 sm:pb-0 px-4 pt-4">
        <div className="modal-panel w-full max-w-lg max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${DEAL_COLORS[log.type]}`}>
                {DEAL_LABELS[log.type].toUpperCase()}
              </span>
              <span className="text-xs opacity-50">{fmtDate(log.created_at)}</span>
            </div>
            <button onClick={onClose} className="modal-close-btn">✕</button>
          </div>

          <div className="overflow-y-auto flex-1 p-4 space-y-4">
            {log.notes
              ? <p className="text-sm">{log.notes}</p>
              : <p className="text-sm opacity-40 italic">No notes.</p>
            }
            {log.photos.length > 0 && (
              <div className={`grid gap-2 ${log.photos.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                {log.photos.map((url, i) => (
                  <button key={i} onClick={() => setLightbox(url)} className="rounded-xl overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Photo ${i + 1}`} className="w-full h-40 object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-border shrink-0 flex gap-2">
            <button onClick={onDelete} className="modal-btn-danger min-h-[44px]">Delete</button>
            <button
              onClick={() => { onToggleResolved(); onClose(); }}
              className={`flex-1 py-2.5 rounded-xl border text-sm font-medium min-h-[44px] transition-colors ${
                log.resolved
                  ? "border-border text-muted-foreground hover:bg-muted/40"
                  : "border-emerald-500/30 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
              }`}
            >{log.resolved ? "Reopen" : "Mark Resolved"}</button>
            <button onClick={onClose} className="modal-btn-primary flex-1 min-h-[44px]">Close</button>
          </div>
        </div>
      </div>
      {lightbox && <DealLightbox url={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}

// ─── Add Deal Modal ───────────────────────────────────────────────────────────

function AddDealModal({ onClose, onAdded }: { onClose: () => void; onAdded: (log: DealLog) => void }) {
  const [type, setType] = useState<DealType>("buy");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files);
    setPhotos((prev) => [...prev, ...arr]);
    arr.forEach((f) => {
      const reader = new FileReader();
      reader.onload = (e) => setPreviews((prev) => [...prev, e.target?.result as string]);
      reader.readAsDataURL(f);
    });
  }

  function removePhoto(i: number) {
    setPhotos((prev) => prev.filter((_, idx) => idx !== i));
    setPreviews((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const uploadedUrls: string[] = [];
      for (const file of photos) {
        const fd = new FormData();
        fd.append("file", file);
        try {
          const url = await uploadDealPhoto(fd);
          uploadedUrls.push(url);
        } catch { /* skip failed uploads */ }
      }
      const data = await createDealLog({ type, notes: notes.trim() || null, photos: uploadedUrls });
      onAdded(data as DealLog);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center modal-backdrop pb-16 sm:pb-0 px-4 pt-4">
      <div className="modal-panel w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="modal-title">Log a Deal</h2>
          <button onClick={onClose} className="modal-close-btn">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* Type */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider opacity-40 font-semibold">Deal Type</label>
            <div className="flex gap-2">
              {(["buy", "sell", "trade"] as DealType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold capitalize transition-colors min-h-[44px] ${
                    type === t ? DEAL_COLORS[t] : "border-border text-muted-foreground hover:border-white/20"
                  }`}
                >{DEAL_LABELS[t]}</button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider opacity-40 font-semibold">Notes <span className="opacity-50 normal-case tracking-normal">(optional)</span></label>
            <textarea
              className="w-full border border-border rounded-xl px-3 py-2.5 text-base bg-background resize-none outline-none focus:ring-1 focus:ring-violet-500"
              rows={3}
              placeholder="e.g. Pikachu ex PSA 10, asked $250…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Photos */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider opacity-40 font-semibold">Photos <span className="opacity-50 normal-case tracking-normal">(optional)</span></label>
            {previews.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-2">
                {previews.map((src, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-20 w-20 object-cover rounded-lg" />
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            <div className="flex gap-2">
              <button onClick={() => libraryRef.current?.click()} className="flex-1 py-3 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-white/30 hover:text-foreground transition-colors min-h-[44px]">Photo library</button>
              <button onClick={() => cameraRef.current?.click()} className="flex-1 py-3 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-white/30 hover:text-foreground transition-colors min-h-[44px]">Camera</button>
            </div>
          </div>

          {error && <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</p>}
        </div>

        <div className="px-4 py-3 border-t border-border shrink-0 flex gap-2">
          <button onClick={onClose} className="modal-btn-ghost flex-1 min-h-[44px]">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="modal-btn-primary flex-1 min-h-[44px]">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Deal Carousel Card ───────────────────────────────────────────────────────

function DealCarouselCard({ log, onClick }: { log: DealLog; onClick: () => void }) {
  const firstPhoto = log.photos[0];
  return (
    <button
      onClick={onClick}
      className="shrink-0 w-56 rounded-2xl border border-border bg-card overflow-hidden text-left hover:border-white/20 transition-all duration-150 active:scale-[0.98]"
    >
      {firstPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={firstPhoto} alt="Deal" className="w-full h-36 object-cover" />
      ) : (
        <div className={`w-full h-36 flex items-center justify-center text-3xl ${
          log.type === "buy" ? "bg-blue-500/8" : log.type === "sell" ? "bg-emerald-500/8" : "bg-amber-500/8"
        }`}>
          {log.type === "buy" ? <ArrowDown size={24} /> : log.type === "sell" ? <DollarSign size={24} /> : <ArrowLeftRight size={24} />}
        </div>
      )}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold tracking-wide ${DEAL_COLORS[log.type]}`}>
            {DEAL_LABELS[log.type].toUpperCase()}
          </span>
          {log.photos.length > 1 && (
            <span className="text-[10px] opacity-40">+{log.photos.length - 1} more</span>
          )}
        </div>
        {log.notes && (
          <p className="text-xs opacity-70 line-clamp-2 leading-relaxed">{log.notes}</p>
        )}
        <p className="text-[10px] opacity-30 mt-1.5">{fmtDate(log.created_at)}</p>
      </div>
    </button>
  );
}

// ─── Past Deal Album ──────────────────────────────────────────────────────────

function PastDealAlbum({ monthLabel, logs, onViewLog }: { monthLabel: string; logs: DealLog[]; onViewLog: (log: DealLog) => void }) {
  const [expanded, setExpanded] = useState(false);
  // Collect all photos for collage thumbnail
  const allPhotos = logs.flatMap((l) => l.photos).slice(0, 4);
  const photoCount = logs.reduce((s, l) => s + l.photos.length, 0);

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 py-1 text-left group"
      >
        {/* Album collage thumbnail */}
        <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-muted/40 grid grid-cols-2 gap-0.5">
          {allPhotos.length === 0 && (
            <div className="col-span-2 row-span-2 flex items-center justify-center opacity-30"><Folder size={20} /></div>
          )}
          {allPhotos.slice(0, 4).map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={url} alt="" className="w-full h-full object-cover" />
          ))}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold inv-label">{monthLabel}</div>
          <div className="text-xs opacity-40">
            {logs.length} deal{logs.length !== 1 ? "s" : ""}
            {photoCount > 0 && ` · ${photoCount} photo${photoCount !== 1 ? "s" : ""}`}
          </div>
        </div>
        <span className="text-[10px] opacity-30 group-hover:opacity-60 transition-opacity">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="space-y-1 pl-[68px]">
          {logs.map((log) => (
            <button
              key={log.id}
              onClick={() => onViewLog(log)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors text-left"
            >
              {log.photos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={log.photos[0]} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-muted/40 flex items-center justify-center shrink-0 opacity-50">
                  {log.type === "buy" ? <ArrowDown size={18} /> : log.type === "sell" ? <DollarSign size={18} /> : <ArrowLeftRight size={18} />}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[9px] px-1 py-0.5 rounded font-bold border ${DEAL_COLORS[log.type]}`}>
                    {DEAL_LABELS[log.type].toUpperCase()}
                  </span>
                  <span className="text-[10px] opacity-40">{fmtDate(log.created_at)}</span>
                </div>
                {log.notes && <p className="text-xs opacity-60 truncate mt-0.5">{log.notes}</p>}
              </div>
              {log.photos.length > 1 && (
                <span className="text-[10px] opacity-30 shrink-0">+{log.photos.length - 1}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Deals Tab Content ────────────────────────────────────────────────────────

function DealsTabContent({
  logs,
  onLogsChange: setLogs,
  addOpen,
  onAddClose,
}: {
  logs: DealLog[];
  onLogsChange: React.Dispatch<React.SetStateAction<DealLog[]>>;
  addOpen: boolean;
  onAddClose: () => void;
}) {
  const [viewLog, setViewLog] = useState<DealLog | null>(null);
  const [confirmDeleteLog, setConfirmDeleteLog] = useState<DealLog | null>(null);

  const activeLogs = logs.filter((l) => !l.resolved);
  const resolvedLogs = logs.filter((l) => l.resolved);

  // Group resolved by "MMMM YYYY"
  const albumMap = new Map<string, DealLog[]>();
  for (const log of resolvedLogs) {
    const d = new Date(log.created_at);
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (!albumMap.has(label)) albumMap.set(label, []);
    albumMap.get(label)!.push(log);
  }
  const albums = Array.from(albumMap.entries());

  async function handleToggleResolved(log: DealLog) {
    const next = !log.resolved;
    try {
      await toggleDealResolved(log.id, next);
      setLogs((prev) => prev.map((l) => l.id === log.id ? { ...l, resolved: next } : l));
      if (viewLog?.id === log.id) setViewLog({ ...log, resolved: next });
    } catch { /* silent */ }
  }

  async function handleDelete(log: DealLog) {
    const photoPaths = log.photos.map((url) => url.split("/deal-photos/")[1] ?? "").filter(Boolean);
    try {
      await deleteDealLog(log.id, photoPaths);
      setLogs((prev) => prev.filter((l) => l.id !== log.id));
      if (viewLog?.id === log.id) setViewLog(null);
    } catch { /* silent */ }
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div>
        <div className="text-sm font-semibold inv-label">Active Deals</div>
        <div className="text-xs opacity-40">{activeLogs.length} open</div>
      </div>

      {/* Active carousel — scroll-snap horizontal */}
      {activeLogs.length === 0 ? (
        <div className="border border-border border-dashed rounded-2xl p-8 text-center text-sm opacity-40">
          No open deals. Tap "+ Log Deal" to add one.
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {activeLogs.map((log) => (
            <div key={log.id} className="snap-start">
              <DealCarouselCard log={log} onClick={() => setViewLog(log)} />
            </div>
          ))}
        </div>
      )}

      {/* Past albums */}
      {albums.length > 0 && (
        <div className="space-y-4">
          <div className="text-[11px] uppercase tracking-wider opacity-40 font-semibold">Past Albums</div>
          <div className="space-y-4 divide-y divide-border/40">
            {albums.map(([label, albumLogs]) => (
              <div key={label} className="pt-4 first:pt-0">
                <PastDealAlbum monthLabel={label} logs={albumLogs} onViewLog={(l) => setViewLog(l)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {addOpen && (
        <AddDealModal
          onClose={onAddClose}
          onAdded={(log) => { setLogs((prev) => [log, ...prev]); onAddClose(); }}
        />
      )}
      {viewLog && (
        <ViewDealModal
          log={viewLog}
          onClose={() => setViewLog(null)}
          onToggleResolved={() => handleToggleResolved(viewLog)}
          onDelete={() => setConfirmDeleteLog(viewLog)}
        />
      )}

      {confirmDeleteLog && (
        <ConfirmationModal
          title="Delete this deal log?"
          description="This deal log and its photos will be permanently removed."
          confirmLabel="Delete"
          destructive
          onConfirm={() => { const log = confirmDeleteLog; setConfirmDeleteLog(null); handleDelete(log); }}
          onCancel={() => setConfirmDeleteLog(null)}
        />
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type AllEntry =
  | { kind: "buy"; date: string; data: BuyExpense }
  | { kind: "sell"; date: string; data: SaleGroup }
  | { kind: "trade"; date: string; data: TradeGroup };

export default function TransactionsClient({
  saleGroups,
  buyExpenses,
  tradeGroups,
  inventoryItems,
  dealLogs,
  workspaceId: _workspaceId,
  activeShow,
}: {
  saleGroups: SaleGroup[];
  buyExpenses: BuyExpense[];
  tradeGroups: TradeGroup[];
  inventoryItems: InventoryItem[];
  dealLogs: DealLog[];
  workspaceId: string;
  activeShow?: { id: string; name: string; expected_cash: number } | null;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [dealLogOpen, setDealLogOpen] = useState(false);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [localDealLogs, setLocalDealLogs] = useState<DealLog[]>(dealLogs);

  async function handleRevert(saleId: string) {
    if (revertingId === saleId) {
      setBusy(true);
      try {
        await revertSale({ saleId });
        setRevertingId(null);
      } finally {
        setBusy(false);
      }
    } else {
      setRevertingId(saleId);
    }
  }

  async function handleDeleteBuy(expenseId: string) {
    try {
      await deleteBuyExpense({ expenseId });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function handleRevertTrade(tradeGroupId: string) {
    try {
      await revertTrade({ tradeGroupId });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Undo failed");
    }
  }

  // Combine all entries for ALL tab, sorted by date desc
  const allEntries = useMemo<AllEntry[]>(() => {
    const entries: AllEntry[] = [
      ...buyExpenses.map((b): AllEntry => ({ kind: "buy", date: b.created_at, data: b })),
      ...saleGroups.map((s): AllEntry => ({ kind: "sell", date: s.soldAt, data: s })),
      ...tradeGroups.map((t): AllEntry => ({ kind: "trade", date: t.date, data: t })),
    ];
    return entries.sort((a, b) => b.date.localeCompare(a.date));
  }, [buyExpenses, saleGroups, tradeGroups]);

  const q = query.trim().toLowerCase();

  const filteredBuys = useMemo(() =>
    q ? buyExpenses.filter((b) => b.description.toLowerCase().includes(q)) : buyExpenses,
    [buyExpenses, q]
  );

  const filteredSells = useMemo(() =>
    q ? saleGroups.filter((s) =>
      s.items.some((it) => it.name.toLowerCase().includes(q) || it.category.toLowerCase().includes(q))
    ) : saleGroups,
    [saleGroups, q]
  );

  const filteredTrades = useMemo(() =>
    q ? tradeGroups.filter((t) =>
      [...t.comingIn, ...t.goingOut].some((tx) => (tx.card_name ?? "").toLowerCase().includes(q))
    ) : tradeGroups,
    [tradeGroups, q]
  );

  const filteredAll = useMemo(() => {
    if (!q) return allEntries;
    return allEntries.filter((e) => {
      if (e.kind === "buy") return e.data.description.toLowerCase().includes(q);
      if (e.kind === "sell") return e.data.items.some((it) => it.name.toLowerCase().includes(q));
      return [...e.data.comingIn, ...e.data.goingOut].some((tx) => (tx.card_name ?? "").toLowerCase().includes(q));
    });
  }, [allEntries, q]);

  // ── Metrics ────────────────────────────────────────────────────────────────
  const buyCount = buyExpenses.length;
  const sellCount = saleGroups.length;
  const tradeCount = tradeGroups.length;
  const hasData = buyCount + sellCount + tradeCount > 0;

  // Avg buy % — from inventory items with cash acquisitions
  const inventoryWithCost = inventoryItems.filter((it) => it.cost != null && it.market != null && it.market > 0 && it.acquisition_type !== "trade");
  const avgBuyPct = inventoryWithCost.length > 0
    ? inventoryWithCost.reduce((s, it) => s + (it.cost! / it.market!) * 100, 0) / inventoryWithCost.length
    : null;

  // Avg sell margin — average ((sell_price - cost_basis) / cost_basis * 100) per sale group
  const sellsWithMargin = saleGroups.filter((sg) => sg.totalCost > 0);
  const avgSellMargin = sellsWithMargin.length > 0
    ? sellsWithMargin.reduce((s, sg) => s + ((sg.total - sg.totalCost) / sg.totalCost) * 100, 0) / sellsWithMargin.length
    : null;

  // Buy tab metrics
  const totalCashSpent = buyExpenses.reduce((s, b) => s + b.cost, 0);
  const buyCosts = buyExpenses.map((b) => b.cost);
  const highestBuy = buyCosts.length > 0 ? Math.max(...buyCosts) : null;
  const lowestBuy = buyCosts.length > 0 ? Math.min(...buyCosts) : null;
  const mostRecentBuyDate = buyExpenses.length > 0 ? buyExpenses[0].created_at : null;

  // Sell tab metrics
  const totalSellRevenue = saleGroups.reduce((s, sg) => s + sg.total, 0);
  const sellProfits = saleGroups.filter((sg) => sg.totalCost > 0).map((sg) => sg.total - sg.totalCost);
  const bestSellProfit = sellProfits.length > 0 ? Math.max(...sellProfits) : null;
  const worstSellProfit = sellProfits.length > 0 ? Math.min(...sellProfits) : null;
  const mostRecentSellDate = saleGroups.length > 0 ? saleGroups[0].soldAt : null;

  // Trade tab metrics
  const cardsIn = tradeGroups.reduce((s, t) => s + t.comingIn.length, 0);
  const cardsOut = tradeGroups.reduce((s, t) => s + t.goingOut.length, 0);
  const tradeValueMoved = tradeGroups.reduce((s, t) => {
    const outVal = t.goingOut.reduce((ss, tx) => ss + (tx.market_price_at_time ?? 0), 0);
    const inVal = t.comingIn.reduce((ss, tx) => ss + (tx.market_price_at_time ?? 0), 0);
    return s + outVal + inVal;
  }, 0);
  const totalCashInTrades = tradeGroups.reduce((s, t) => s + (t.cashDiff < 0 ? Math.abs(t.cashDiff) : 0), 0);

  const openDealCount = localDealLogs.filter((l) => !l.resolved).length;

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: "all", label: "All", count: buyCount + sellCount + tradeCount },
    { id: "buys", label: "Buys", count: buyCount },
    { id: "sells", label: "Sells", count: sellCount },
    { id: "trades", label: "Trades", count: tradeCount },
    { id: "deals", label: "Deals", count: openDealCount },
  ];

  const isCompletelyEmpty = !hasData;

  return (
    <div className="space-y-4">
      {/* Active show banner */}
      {activeShow && (
        <a
          href="/protected/show"
          className="flex items-center justify-between px-3 py-2 rounded-xl border border-amber-400/25 bg-amber-400/8 hover:bg-amber-400/12 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 truncate">
              Show active: {activeShow.name}
            </span>
          </div>
          <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0 ml-2">
            Transactions auto-linked →
          </span>
        </a>
      )}

      {/* Summary bar — contextual per tab */}
      <div className="flex flex-wrap gap-2">
        {(tab === "all" || tab === "deals") && (() => {
          const metrics = [
            { label: "Transactions", value: String(buyCount + sellCount + tradeCount), dim: !hasData },
            { label: "Cards Bought", value: String(buyCount), dim: buyCount === 0 },
            { label: "Cards Sold", value: String(sellCount), dim: sellCount === 0 },
            { label: "Trades", value: String(tradeCount), dim: tradeCount === 0 },
            { label: "Avg Buy %", value: avgBuyPct != null ? `${avgBuyPct.toFixed(0)}%` : "—", dim: avgBuyPct == null, color: avgBuyPct != null ? (avgBuyPct <= 65 ? "text-emerald-400" : avgBuyPct <= 80 ? undefined : "text-red-400") : undefined },
            { label: "Avg Sell Margin", value: avgSellMargin != null ? `${avgSellMargin >= 0 ? "+" : ""}${avgSellMargin.toFixed(0)}%` : "—", dim: avgSellMargin == null, color: avgSellMargin != null ? (avgSellMargin >= 0 ? "text-emerald-400" : "text-red-400") : undefined },
          ];
          return metrics.map((m) => <MetricCard key={m.label} {...m} />);
        })()}

        {tab === "buys" && (() => {
          const metrics = [
            { label: "Cards Bought", value: String(buyCount), dim: buyCount === 0 },
            { label: "Avg Buy %", value: avgBuyPct != null ? `${avgBuyPct.toFixed(0)}%` : "—", dim: avgBuyPct == null, color: avgBuyPct != null ? (avgBuyPct <= 65 ? "text-emerald-400" : avgBuyPct <= 80 ? undefined : "text-red-400") : undefined },
            { label: "Cash Spent", value: totalCashSpent > 0 ? fmt(totalCashSpent) : "—", dim: totalCashSpent === 0 },
            { label: "Highest Buy", value: highestBuy != null ? fmt(highestBuy) : "—", dim: highestBuy == null },
            { label: "Lowest Buy", value: lowestBuy != null ? fmt(lowestBuy) : "—", dim: lowestBuy == null },
            { label: "Last Buy", value: mostRecentBuyDate ? fmtDate(mostRecentBuyDate) : "—", dim: mostRecentBuyDate == null },
          ];
          return metrics.map((m) => <MetricCard key={m.label} {...m} />);
        })()}

        {tab === "sells" && (() => {
          const metrics = [
            { label: "Cards Sold", value: String(sellCount), dim: sellCount === 0 },
            { label: "Total Revenue", value: totalSellRevenue > 0 ? fmt(totalSellRevenue) : "—", dim: totalSellRevenue === 0 },
            { label: "Avg Sell Margin", value: avgSellMargin != null ? `${avgSellMargin >= 0 ? "+" : ""}${avgSellMargin.toFixed(0)}%` : "—", dim: avgSellMargin == null, color: avgSellMargin != null ? (avgSellMargin >= 0 ? "text-emerald-400" : "text-red-400") : undefined },
            { label: "Best Sell", value: bestSellProfit != null ? fmt(bestSellProfit) : "—", dim: bestSellProfit == null, color: bestSellProfit != null && bestSellProfit > 0 ? "text-emerald-400" : undefined },
            { label: "Worst Sell", value: worstSellProfit != null ? fmt(worstSellProfit) : "—", dim: worstSellProfit == null, color: worstSellProfit != null && worstSellProfit < 0 ? "text-red-400" : undefined },
            { label: "Last Sell", value: mostRecentSellDate ? fmtDate(mostRecentSellDate) : "—", dim: mostRecentSellDate == null },
          ];
          return metrics.map((m) => <MetricCard key={m.label} {...m} />);
        })()}

        {tab === "trades" && (() => {
          const metrics = [
            { label: "Trades", value: String(tradeCount), dim: tradeCount === 0 },
            { label: "Cards In", value: String(cardsIn), dim: cardsIn === 0 },
            { label: "Cards Out", value: String(cardsOut), dim: cardsOut === 0 },
            { label: "Value Moved", value: tradeValueMoved > 0 ? fmt(tradeValueMoved) : "—", dim: tradeValueMoved === 0 },
            { label: "Cash Received", value: totalCashInTrades > 0 ? fmt(totalCashInTrades) : "—", dim: totalCashInTrades === 0, color: totalCashInTrades > 0 ? "text-emerald-400" : undefined },
          ];
          return metrics.map((m) => <MetricCard key={m.label} {...m} />);
        })()}
      </div>

      {/* Action buttons — always visible */}
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => setBuyModalOpen(true)} className="py-2 rounded-lg bg-blue-600/15 border border-blue-500/25 text-blue-400 text-sm font-semibold hover:bg-blue-600/25 transition-colors duration-150 flex items-center justify-center gap-1.5">
            <span className="text-base leading-none">+</span> Buy
          </button>
          <button onClick={() => setSellModalOpen(true)} className="py-2 rounded-lg bg-emerald-600/15 border border-emerald-500/25 text-emerald-400 text-sm font-semibold hover:bg-emerald-600/25 transition-colors duration-150 flex items-center justify-center gap-1.5">
            <span className="text-base leading-none">$</span> Sell
          </button>
          <button onClick={() => setTradeModalOpen(true)} className="py-2 rounded-lg bg-violet-600/15 border border-violet-500/25 text-violet-400 text-sm font-semibold hover:bg-violet-600/25 transition-colors duration-150 flex items-center justify-center gap-1.5">
            <span className="text-base leading-none">⇄</span> Trade
          </button>
        </div>
        {tab === "deals" && (
          <button onClick={() => setDealLogOpen(true)} className="w-full py-2 rounded-lg bg-violet-600/20 border border-violet-500/30 text-violet-400 text-sm font-semibold hover:bg-violet-600/30 transition-colors flex items-center justify-center gap-1.5">
            + Log Deal
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="space-y-2">
        <div className="flex gap-1 border-b border-border/40">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm font-medium transition-all duration-150 relative ${
                tab === t.id
                  ? "text-violet-400 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-violet-500 after:rounded-t"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 text-[10px] tabular-nums ${tab === t.id ? "text-violet-400 opacity-80" : "opacity-35"}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
        {/* Search — hide on deals tab */}
        {tab !== "deals" && (
          <input
            type="search"
            placeholder="Search transactions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500"
          />
        )}
      </div>

      {/* Transaction list */}
      <div className="space-y-1">
        {tab === "all" && (
          isCompletelyEmpty
            ? <GlobalEmptyState onBuy={() => setBuyModalOpen(true)} onTrade={() => setTradeModalOpen(true)} />
            : filteredAll.length === 0
              ? <EmptyState q={q} />
              : filteredAll.map((e) => {
                  if (e.kind === "buy") return <BuyRow key={e.data.id} expense={e.data} onDelete={handleDeleteBuy} />;
                  if (e.kind === "sell") return (
                    <SellRowWithRevert key={e.data.saleId} sale={e.data} revertingId={revertingId} busy={busy} onRevert={handleRevert} onCancelRevert={() => setRevertingId(null)} />
                  );
                  return <TradeRow key={e.data.tradeGroupId} trade={e.data} onRevert={handleRevertTrade} />;
                })
        )}
        {tab === "buys" && (
          filteredBuys.length === 0
            ? <EmptyState q={q} label={q ? undefined : "No buys recorded yet."} />
            : filteredBuys.map((b) => <BuyRow key={b.id} expense={b} onDelete={handleDeleteBuy} />)
        )}
        {tab === "sells" && (
          filteredSells.length === 0
            ? <EmptyState q={q} label={q ? undefined : "No sells recorded yet."} />
            : filteredSells.map((s) => (
                <SellRowWithRevert key={s.saleId} sale={s} revertingId={revertingId} busy={busy} onRevert={handleRevert} onCancelRevert={() => setRevertingId(null)} />
              ))
        )}
        {tab === "trades" && (
          filteredTrades.length === 0
            ? <EmptyState q={q} label={q ? undefined : "No trades recorded yet."} />
            : filteredTrades.map((t) => <TradeRow key={t.tradeGroupId} trade={t} onRevert={handleRevertTrade} />)
        )}
        {tab === "deals" && <DealsTabContent logs={localDealLogs} onLogsChange={setLocalDealLogs} addOpen={dealLogOpen} onAddClose={() => setDealLogOpen(false)} />}
      </div>

      {/* Modals */}
      {buyModalOpen && <RecordBuyModal onClose={() => setBuyModalOpen(false)} />}
      {sellModalOpen && <RecordSellModal inventoryItems={inventoryItems} onClose={() => setSellModalOpen(false)} />}
      {tradeModalOpen && (
        <TradeModal open={tradeModalOpen} onClose={() => setTradeModalOpen(false)} items={inventoryItems as Parameters<typeof TradeModal>[0]["items"]} />
      )}
    </div>
  );
}

// ─── Helper sub-components ────────────────────────────────────────────────────

function MetricCard({ label, value, dim, color }: { label: string; value: string; dim?: boolean; color?: string }) {
  return (
    <div className="metric-card flex-1 min-w-[100px]">
      <div className="text-[10px] uppercase tracking-wider font-semibold inv-label" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className={`text-base font-bold inv-price mt-0.5 ${dim ? "opacity-30" : ""} ${color ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}

function EmptyState({ q, label }: { q?: string; label?: string }) {
  return (
    <div className="border border-border/40 rounded-xl p-6 text-sm text-muted-foreground text-center opacity-60">
      {label ?? (q ? `No results for "${q}"` : "Nothing here yet.")}
    </div>
  );
}

function GlobalEmptyState({ onBuy, onTrade }: { onBuy: () => void; onTrade: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center space-y-5">
      <div className="text-5xl opacity-20 select-none">⇄</div>
      <div>
        <div className="text-base font-semibold inv-label text-foreground/80">No transactions recorded yet</div>
        <div className="text-sm text-muted-foreground mt-1 max-w-xs">Record your first buy or trade to start tracking your margins and profit</div>
      </div>
      <div className="flex gap-3 flex-wrap justify-center">
        <button onClick={onBuy} className="px-4 py-2.5 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 text-sm font-semibold hover:bg-blue-600/30 transition-colors">
          + Record Buy
        </button>
        <button onClick={onTrade} className="px-4 py-2.5 rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-400 text-sm font-semibold hover:bg-violet-600/30 transition-colors">
          ⇄ Record Trade
        </button>
      </div>
    </div>
  );
}

// SellRow with revert confirmation inline
function SellRowWithRevert({
  sale,
  revertingId,
  busy,
  onRevert,
  onCancelRevert,
}: {
  sale: SaleGroup;
  revertingId: string | null;
  busy: boolean;
  onRevert: (id: string) => void;
  onCancelRevert: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isSingle = sale.items.length === 1;
  const profit = sale.totalCost > 0 ? sale.total - sale.totalCost : null;
  const isReverting = revertingId === sale.saleId;

  return (
    <div className="rounded-lg overflow-hidden" style={{ borderLeft: "3px solid rgb(16 185 129 / 0.3)" }}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors duration-150 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="w-14 shrink-0">
          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold font-mono bg-emerald-500/15 text-emerald-500">SELL</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold inv-label truncate">
            {isSingle ? sale.items[0].name : `${sale.items.length} items`}
          </div>
          <div className="text-xs opacity-50 mt-0.5">
            {sale.items.map((it) => it.category).filter((v, i, a) => a.indexOf(v) === i).join(" · ")}
            {!isSingle && ` · ${sale.items.length} cards`}
          </div>
        </div>
        <div className="text-right shrink-0 flex items-center gap-2">
          <div>
            <div className="text-sm font-semibold inv-price text-emerald-500">{fmt(sale.total)}</div>
            {profit != null && (
              <div className={`text-[11px] inv-price ${profitColor(profit)}`}>
                {profit >= 0 ? "+" : ""}{fmt(profit)}
              </div>
            )}
          </div>
          <div className="text-[11px] opacity-40">{fmtDate(sale.soldAt)}</div>
          <span className="text-[10px] opacity-30">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/50">
          {sale.items.map((it, i) => (
            <div key={it.id} className={`flex items-center justify-between px-4 py-2.5 text-sm gap-3 ${i > 0 ? "border-t border-border/30" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{it.name}</div>
                <div className="text-xs opacity-50 capitalize">{COND_ABBR[it.condition as Condition] ?? it.condition} · {it.category}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="inv-price text-emerald-500 font-semibold">{fmt(it.sold_price)}</div>
                {(it.cost_basis ?? it.cost) != null && (
                  <div className="text-xs opacity-50 inv-price">cost {fmt(it.cost_basis ?? it.cost)}</div>
                )}
              </div>
            </div>
          ))}
          <div className="border-t border-border/50 px-4 py-2 flex items-center justify-between">
            <span className="text-xs opacity-50">Sale total</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold inv-price text-emerald-500">{fmt(sale.total)}</span>
              {isReverting ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs opacity-60">Revert?</span>
                  <button
                    onClick={() => onRevert(sale.saleId)}
                    disabled={busy}
                    className="text-xs px-2 py-1 rounded border border-red-400 text-red-500 font-medium disabled:opacity-50"
                  >{busy ? "…" : "Yes"}</button>
                  <button
                    onClick={onCancelRevert}
                    disabled={busy}
                    className="text-xs px-2 py-1 rounded border border-border opacity-50"
                  >No</button>
                </div>
              ) : (
                <button
                  onClick={() => onRevert(sale.saleId)}
                  className="text-[11px] px-2 py-1 rounded border border-border opacity-50 hover:opacity-80 transition-opacity"
                >Revert</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

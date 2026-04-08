"use client";

import { useState, useMemo, useRef } from "react";
import type { SaleGroup, BuyExpense, TradeGroup, DealLog } from "./TransactionsServer";
import { revertSale, recordQuickBuy, type QuickBuyCard } from "./actions";
import { uploadDealPhoto, createDealLog, toggleDealResolved, deleteDealLog } from "../photos/actions";
import TradeModal from "../inventory/TradeModal";

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

function blankCard(): QuickBuyCard & { _id: string } {
  return { _id: crypto.randomUUID(), name: "", condition: "Near Mint", market: 0 };
}

function RecordBuyModal({ onClose }: { onClose: () => void }) {
  const [sellerName, setSellerName] = useState("");
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

  function addCard() {
    setCards((cs) => [...cs, blankCard()]);
  }

  function removeCard(id: string) {
    setCards((cs) => cs.filter((c) => c._id !== id));
  }

  async function handleSubmit() {
    if (!sellerName.trim()) { setErr("Seller name required"); return; }
    if (cards.length === 0) { setErr("Add at least one card"); return; }
    if (totalCost <= 0) { setErr("Total cost must be > 0"); return; }
    setBusy(true);
    setErr(null);
    try {
      await recordQuickBuy({
        sellerName: sellerName.trim(),
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold inv-label">Record Buy</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-lg">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Seller */}
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wider opacity-40 font-semibold">Seller Name</label>
            <input
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500"
              placeholder="e.g. John D."
              value={sellerName}
              onChange={(e) => setSellerName(e.target.value)}
            />
          </div>

          {/* Cards */}
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider opacity-40 font-semibold">Cards</label>
            {cards.map((card) => (
              <div key={card._id} className="flex gap-2 items-start">
                <input
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500"
                  placeholder="Card name"
                  value={card.name}
                  onChange={(e) => updateCard(card._id, { name: e.target.value })}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-20 bg-background border border-border rounded-lg px-2 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500 inv-price"
                  placeholder="Mkt"
                  value={card.market || ""}
                  onChange={(e) => updateCard(card._id, { market: parseFloat(e.target.value) || 0 })}
                />
                <select
                  className="w-28 bg-background border border-border rounded-lg px-2 py-2 text-xs outline-none focus:ring-1 focus:ring-violet-500"
                  value={card.condition}
                  onChange={(e) => updateCard(card._id, { condition: e.target.value as Condition })}
                >
                  {CONDITIONS.map((c) => <option key={c} value={c}>{c.split(" ")[0]}</option>)}
                </select>
                {cards.length > 1 && (
                  <button
                    onClick={() => removeCard(card._id)}
                    className="text-muted-foreground hover:text-red-500 transition-colors pt-2 text-sm"
                  >✕</button>
                )}
              </div>
            ))}
            <button
              onClick={addCard}
              className="text-xs text-violet-500 hover:text-violet-400 transition-colors"
            >+ Add card</button>
          </div>

          {/* Total cost */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] uppercase tracking-wider opacity-40 font-semibold">Total Cost Paid</label>
              {totalMarket > 0 && (
                <span className="text-[11px] opacity-50 inv-price">
                  {((totalCost / totalMarket) * 100).toFixed(0)}% of {fmt(totalMarket)} market
                </span>
              )}
            </div>
            <input
              type="number"
              min="0"
              step="0.01"
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
              <select
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500"
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value as "alex" | "mila" | "shared")}
              >
                <option value="shared">Shared</option>
                <option value="alex">Alex</option>
                <option value="mila">Mila</option>
              </select>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-[11px] uppercase tracking-wider opacity-40 font-semibold">Payment</label>
              <select
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500"
                value={paymentType ?? ""}
                onChange={(e) => setPaymentType(e.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="venmo">Venmo</option>
                <option value="paypal">PayPal</option>
                <option value="trade">Trade</option>
                <option value="">Other</option>
              </select>
            </div>
          </div>

          {/* Add to inventory toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={addToInventory}
              onChange={(e) => setAddToInventory(e.target.checked)}
              className="accent-violet-500 w-4 h-4"
            />
            <span className="text-sm">Add cards to inventory</span>
          </label>

          {err && <p className="text-sm text-red-500">{err}</p>}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted/40 transition-colors"
          >Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={busy}
            className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >{busy ? "Saving…" : "Record Buy"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Row components ───────────────────────────────────────────────────────────

function BuyRow({ expense }: { expense: BuyExpense }) {
  // Parse card count from description "Buy: Seller — N cards"
  const match = expense.description.match(/—\s*(\d+)\s*card/);
  const cardCount = match ? parseInt(match[1]) : null;
  const sellerMatch = expense.description.match(/^Buy:\s*(.+?)\s*—/);
  const seller = sellerMatch ? sellerMatch[1] : expense.description.replace(/^Buy:\s*/, "");

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/[0.03] transition-colors duration-150 inv-row-buy">
      <div className="w-14 shrink-0">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold font-mono bg-blue-500/15 text-blue-500">BUY</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold inv-label truncate">{seller}</div>
        <div className="text-xs opacity-50 mt-0.5">
          {cardCount != null ? `${cardCount} card${cardCount !== 1 ? "s" : ""}` : expense.description}
          {expense.paid_by && <span className="ml-2">· {expense.paid_by}</span>}
          {expense.payment_type && <span className="ml-1">· {expense.payment_type}</span>}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold inv-price text-red-400">{fmt(expense.cost)}</div>
        <div className="text-[11px] opacity-50">{fmtDate(expense.created_at)}</div>
      </div>
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
                <div className="text-xs opacity-50 capitalize">{it.condition} · {it.category}</div>
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

function TradeRow({ trade }: { trade: TradeGroup }) {
  const [expanded, setExpanded] = useState(false);
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
        </div>
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
      <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm pb-16 sm:pb-0 px-4 pt-4">
        <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${DEAL_COLORS[log.type]}`}>
                {DEAL_LABELS[log.type].toUpperCase()}
              </span>
              <span className="text-xs opacity-50">{fmtDate(log.created_at)}</span>
            </div>
            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-xl transition-colors">✕</button>
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
            <button
              onClick={onDelete}
              className="px-3 py-2.5 rounded-xl border border-red-500/30 text-red-500 text-sm font-medium min-h-[44px] hover:bg-red-500/10 transition-colors"
            >Delete</button>
            <button
              onClick={() => { onToggleResolved(); onClose(); }}
              className={`flex-1 py-2.5 rounded-xl border text-sm font-medium min-h-[44px] transition-colors ${
                log.resolved
                  ? "border-border text-muted-foreground hover:bg-muted/40"
                  : "border-emerald-500/30 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
              }`}
            >{log.resolved ? "Reopen" : "Mark Resolved"}</button>
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold min-h-[44px] transition-colors"
            >Close</button>
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
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm pb-16 sm:pb-0 px-4 pt-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-base font-semibold inv-label">Log a Deal</h2>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-xl transition-colors">✕</button>
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
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground min-h-[44px] hover:bg-muted/40 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold disabled:opacity-50 min-h-[44px] transition-colors">
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
          {log.type === "buy" ? "📥" : log.type === "sell" ? "💰" : "🔄"}
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
            <div className="col-span-2 row-span-2 flex items-center justify-center text-xl opacity-30">📁</div>
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
                <div className="w-10 h-10 rounded-lg bg-muted/40 flex items-center justify-center text-base shrink-0">
                  {log.type === "buy" ? "📥" : log.type === "sell" ? "💰" : "🔄"}
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
  logs: initialLogs,
}: {
  logs: DealLog[];
}) {
  const [logs, setLogs] = useState<DealLog[]>(initialLogs);
  const [addOpen, setAddOpen] = useState(false);
  const [viewLog, setViewLog] = useState<DealLog | null>(null);

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
    if (!confirm("Delete this deal log?")) return;
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
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold inv-label">Active Deals</div>
          <div className="text-xs opacity-40">{activeLogs.length} open</div>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="px-3 py-1.5 rounded-lg bg-violet-600/20 border border-violet-500/30 text-violet-400 text-sm font-semibold hover:bg-violet-600/30 transition-colors"
        >+ Log Deal</button>
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
          onClose={() => setAddOpen(false)}
          onAdded={(log) => { setLogs((prev) => [log, ...prev]); }}
        />
      )}
      {viewLog && (
        <ViewDealModal
          log={viewLog}
          onClose={() => setViewLog(null)}
          onToggleResolved={() => handleToggleResolved(viewLog)}
          onDelete={() => handleDelete(viewLog)}
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
}: {
  saleGroups: SaleGroup[];
  buyExpenses: BuyExpense[];
  tradeGroups: TradeGroup[];
  inventoryItems: InventoryItem[];
  dealLogs: DealLog[];
  workspaceId: string;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  // Summary metrics
  const totalSpent = buyExpenses.reduce((s, b) => s + b.cost, 0);
  const totalRevenue = saleGroups.reduce((s, sg) => s + sg.total, 0);
  const totalCost = saleGroups.reduce((s, sg) => s + sg.totalCost, 0);
  const netProfit = totalRevenue - (totalCost > 0 ? totalCost : 0);
  const buyCount = buyExpenses.length;
  const sellCount = saleGroups.length;
  const tradeCount = tradeGroups.length;

  const openDealCount = dealLogs.filter((l) => !l.resolved).length;

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: "all", label: "All", count: buyCount + sellCount + tradeCount },
    { id: "buys", label: "Buys", count: buyCount },
    { id: "sells", label: "Sells", count: sellCount },
    { id: "trades", label: "Trades", count: tradeCount },
    { id: "deals", label: "Deals", count: openDealCount },
  ];

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Total Spent", value: fmt(totalSpent), color: "text-red-400" },
          { label: "Total Revenue", value: fmt(totalRevenue), color: "text-emerald-500" },
          { label: "Net Profit", value: fmt(netProfit), color: profitColor(netProfit) },
          { label: "Transactions", value: `${buyCount + sellCount + tradeCount}`, color: "text-foreground" },
        ].map((m) => (
          <div key={m.label} className="bg-card border border-border rounded-lg px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider opacity-40 font-semibold inv-label">{m.label}</div>
            <div className={`text-xl font-bold inv-price mt-1 ${m.color}`}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Action buttons — hidden on deals tab */}
      {tab !== "deals" && <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setBuyModalOpen(true)}
          className="px-4 py-2 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 text-sm font-semibold hover:bg-blue-600/30 transition-colors duration-150"
        >
          + Record Buy
        </button>
        <button
          onClick={() => setTradeModalOpen(true)}
          className="px-4 py-2 rounded-lg bg-amber-600/20 border border-amber-500/30 text-amber-400 text-sm font-semibold hover:bg-amber-600/30 transition-colors duration-150"
        >
          ⇄ Record Trade
        </button>
      </div>}

      {/* Tab bar + search — hide search on deals tab */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-all duration-150 ${
                tab === t.id
                  ? "bg-violet-600 text-white"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`ml-1.5 text-[10px] ${tab === t.id ? "opacity-80" : "opacity-40"}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
        {tab !== "deals" && (
          <input
            type="search"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 min-w-[160px] bg-background border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-violet-500"
          />
        )}
      </div>

      {/* Transaction list */}
      <div className="space-y-1">
        {tab === "all" && (
          filteredAll.length === 0
            ? <EmptyState q={q} />
            : filteredAll.map((e) => {
                if (e.kind === "buy") return <BuyRow key={e.data.id} expense={e.data} />;
                if (e.kind === "sell") return (
                  <SellRowWithRevert
                    key={e.data.saleId}
                    sale={e.data}
                    revertingId={revertingId}
                    busy={busy}
                    onRevert={handleRevert}
                    onCancelRevert={() => setRevertingId(null)}
                  />
                );
                return <TradeRow key={e.data.tradeGroupId} trade={e.data} />;
              })
        )}
        {tab === "buys" && (
          filteredBuys.length === 0
            ? <EmptyState q={q} />
            : filteredBuys.map((b) => <BuyRow key={b.id} expense={b} />)
        )}
        {tab === "sells" && (
          filteredSells.length === 0
            ? <EmptyState q={q} />
            : filteredSells.map((s) => (
                <SellRowWithRevert
                  key={s.saleId}
                  sale={s}
                  revertingId={revertingId}
                  busy={busy}
                  onRevert={handleRevert}
                  onCancelRevert={() => setRevertingId(null)}
                />
              ))
        )}
        {tab === "trades" && (
          filteredTrades.length === 0
            ? <EmptyState q={q} label="No trades recorded yet. Use 'Record Trade' to add one." />
            : filteredTrades.map((t) => <TradeRow key={t.tradeGroupId} trade={t} />)
        )}
        {tab === "deals" && <DealsTabContent logs={dealLogs} />}
      </div>

      {/* Modals */}
      {buyModalOpen && <RecordBuyModal onClose={() => setBuyModalOpen(false)} />}
      {tradeModalOpen && (
        <TradeModal
          open={tradeModalOpen}
          onClose={() => setTradeModalOpen(false)}
          items={inventoryItems as Parameters<typeof TradeModal>[0]["items"]}
        />
      )}
    </div>
  );
}

// ─── Helper sub-components ────────────────────────────────────────────────────

function EmptyState({ q, label }: { q?: string; label?: string }) {
  return (
    <div className="border border-border rounded-xl p-6 text-sm opacity-50 text-center">
      {label ?? (q ? `No results for "${q}"` : "Nothing here yet.")}
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
                <div className="text-xs opacity-50 capitalize">{it.condition} · {it.category}</div>
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

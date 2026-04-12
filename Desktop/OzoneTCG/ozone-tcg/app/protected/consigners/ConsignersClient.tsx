"use client";

import { useState } from "react";
import {
  createConsigner, updateConsigner, deleteConsigner,
  recordPayout, receiveCards,
} from "./actions";
import type { ReceiveCardInput } from "./actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SoldItem = {
  id: string;
  name: string;
  sold_price: number | null;
  consigner_payout: number | null;
  sold_at: string | null;
  set_name: string | null;
  card_number: string | null;
};

export type PayoutRecord = {
  id: string;
  amount: number;
  payment_method: string | null;
  date: string;
  notes: string | null;
};

export type Consigner = {
  id: string;
  name: string;
  rate: number;
  phone: string | null;
  notes: string | null;
  token: string;
  created_at: string;
  active_count: number;
  active_market_value: number;
  sold_count: number;
  sold_revenue: number;
  pending_payout: number;
  total_paid_out: number;
  sales: SoldItem[];
  payouts: PayoutRecord[];
};

type EditForm = { name: string; rate: string; phone: string; notes: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-fuchsia-500", "bg-orange-500",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = ((hash << 5) - hash) + ch.charCodeAt(0);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function fmt(v: number | null) {
  if (v == null) return "—";
  return `$${v.toFixed(2)}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function portalUrl(token: string) {
  return `${typeof window !== "undefined" ? window.location.origin : ""}/consigner/${token}`;
}

function blankEditForm(): EditForm {
  return { name: "", rate: "85", phone: "", notes: "" };
}

function consignerToForm(c: Consigner): EditForm {
  return {
    name: c.name,
    rate: String(Math.round(c.rate * 100)),
    phone: c.phone ?? "",
    notes: c.notes ?? "",
  };
}

// ─── Card row form for Receive Cards ──────────────────────────────────────────

type CardRow = ReceiveCardInput & { _id: string };

function blankCard(): CardRow {
  return {
    _id: crypto.randomUUID(),
    name: "",
    set_name: null,
    card_number: null,
    condition: "Near Mint",
    category: "single",
    grade: null,
    market: null,
  };
}

const CONDITIONS = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"] as const;
const COND_ABBR: Record<string, string> = {
  "Near Mint": "NM", "Lightly Played": "LP", "Moderately Played": "MP",
  "Heavily Played": "HP", "Damaged": "DMG",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConsignerFormFields({
  form, setForm,
}: {
  form: EditForm;
  setForm: (f: EditForm) => void;
}) {
  return (
    <div className="space-y-2">
      <input
        className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
        placeholder="Name *"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <div className="flex items-center gap-2">
        <input
          className="w-24 border rounded-lg px-3 py-2 text-sm bg-background"
          placeholder="Rate %"
          inputMode="decimal"
          value={form.rate}
          onChange={(e) => setForm({ ...form, rate: e.target.value })}
        />
        <span className="text-sm opacity-60">% to consigner (default 85)</span>
      </div>
      <input
        className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
        placeholder="Phone (optional)"
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
      />
      <textarea
        className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
        placeholder="Notes (optional)"
        rows={2}
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
      />
    </div>
  );
}

// ─── Receive Cards Modal ───────────────────────────────────────────────────────

function ReceiveCardsModal({
  consigner,
  onClose,
}: {
  consigner: Consigner;
  onClose: () => void;
}) {
  const [cards, setCards] = useState<CardRow[]>([blankCard()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function updateCard(id: string, patch: Partial<CardRow>) {
    setCards((cs) => cs.map((c) => c._id === id ? { ...c, ...patch } : c));
  }

  async function handleSubmit() {
    const valid = cards.filter((c) => c.name.trim());
    if (valid.length === 0) { setErr("Enter at least one card name"); return; }
    setBusy(true); setErr(null);
    try {
      await receiveCards({
        consignerId: consigner.id,
        cards: valid.map(({ _id: _, ...c }) => c),
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold">Receive Cards</h2>
            <p className="text-xs opacity-50 mt-0.5">
              {consigner.name} · {Math.round(consigner.rate * 100)}% rate
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-lg">✕</button>
        </div>

        <div className="p-5 space-y-3">
          {cards.map((card, i) => (
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
                  className="w-20 bg-background border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-violet-500"
                  placeholder="Price $"
                  value={card.market ?? ""}
                  onChange={(e) => updateCard(card._id, { market: parseFloat(e.target.value) || null })}
                />
                {cards.length > 1 && (
                  <button
                    onClick={() => setCards((cs) => cs.filter((c) => c._id !== card._id))}
                    className="text-muted-foreground hover:text-red-500 transition-colors text-sm shrink-0"
                  >✕</button>
                )}
              </div>
              {/* Row 2: category + condition + grade */}
              <div className="flex gap-2 flex-wrap">
                <select
                  className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs outline-none"
                  value={card.category}
                  onChange={(e) => updateCard(card._id, { category: e.target.value as CardRow["category"], grade: null })}
                >
                  <option value="single">Single</option>
                  <option value="slab">Slab</option>
                  <option value="sealed">Sealed</option>
                </select>
                <select
                  className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs outline-none"
                  value={card.condition}
                  onChange={(e) => updateCard(card._id, { condition: e.target.value as CardRow["condition"] })}
                >
                  {CONDITIONS.map((c) => <option key={c} value={c}>{COND_ABBR[c]}</option>)}
                </select>
                {card.category === "slab" && (
                  <input
                    className="w-28 bg-background border border-border rounded-lg px-2 py-1.5 text-xs outline-none"
                    placeholder="Grade (PSA 10)"
                    value={card.grade ?? ""}
                    onChange={(e) => updateCard(card._id, { grade: e.target.value || null })}
                  />
                )}
              </div>
              {/* Row 3: set + card number */}
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-background border border-border rounded-lg px-2 py-1.5 text-xs outline-none"
                  placeholder="Set name"
                  value={card.set_name ?? ""}
                  onChange={(e) => updateCard(card._id, { set_name: e.target.value || null })}
                />
                <input
                  className="w-24 bg-background border border-border rounded-lg px-2 py-1.5 text-xs outline-none"
                  placeholder="Card #"
                  value={card.card_number ?? ""}
                  onChange={(e) => updateCard(card._id, { card_number: e.target.value || null })}
                />
              </div>
              {i === 0 && cards.length === 1 && (
                <p className="text-[11px] opacity-40">
                  Price = sticker / asking price. Leave blank if unknown.
                </p>
              )}
            </div>
          ))}

          <button
            onClick={() => setCards((cs) => [...cs, blankCard()])}
            className="text-xs text-violet-500 hover:text-violet-400 transition-colors"
          >
            + Add another card
          </button>

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
          >
            {busy ? "Saving…" : `Add ${cards.filter((c) => c.name.trim()).length || ""} Card${cards.filter((c) => c.name.trim()).length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Record Payout Modal ───────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "venmo", label: "Venmo" },
  { value: "paypal", label: "PayPal" },
  { value: "check", label: "Check" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "other", label: "Other" },
];

function RecordPayoutModal({
  consigner,
  onClose,
}: {
  consigner: Consigner;
  onClose: () => void;
}) {
  const [amountStr, setAmountStr] = useState(
    consigner.pending_payout > 0 ? consigner.pending_payout.toFixed(2) : ""
  );
  const [method, setMethod] = useState("cash");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const amount = parseFloat(amountStr) || 0;

  async function handleSubmit() {
    if (amount <= 0) { setErr("Enter a payout amount"); return; }
    setBusy(true); setErr(null);
    try {
      await recordPayout({
        consignerId: consigner.id,
        amount,
        paymentMethod: method,
        date: new Date(date).toISOString(),
        notes: notes.trim() || null,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold">Record Payout</h2>
            <p className="text-xs opacity-50 mt-0.5">{consigner.name}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Pending context */}
          {consigner.pending_payout > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/6 px-4 py-3 text-sm space-y-0.5">
              <div className="flex justify-between">
                <span className="opacity-60">Pending payout</span>
                <span className="font-semibold text-emerald-500">{fmt(consigner.pending_payout)}</span>
              </div>
              {consigner.total_paid_out > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="opacity-50">Previously paid</span>
                  <span className="opacity-60">{fmt(consigner.total_paid_out)}</span>
                </div>
              )}
            </div>
          )}

          {/* Amount */}
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wider opacity-40 font-semibold">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm opacity-40">$</span>
              <input
                type="number" min="0" step="0.01"
                className="w-full bg-background border border-border rounded-lg pl-6 pr-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500"
                placeholder="0.00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                autoFocus
              />
            </div>
            {consigner.pending_payout > 0 && amount > 0 && Math.abs(amount - consigner.pending_payout) > 0.01 && (
              <button
                className="text-xs opacity-50 hover:opacity-80 underline"
                onClick={() => setAmountStr(consigner.pending_payout.toFixed(2))}
              >
                Use pending amount ({fmt(consigner.pending_payout)})
              </button>
            )}
          </div>

          {/* Method */}
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wider opacity-40 font-semibold">Payment Method</label>
            <select
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wider opacity-40 font-semibold">Date</label>
            <input
              type="date"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wider opacity-40 font-semibold">Notes <span className="opacity-50 normal-case tracking-normal">(optional)</span></label>
            <input
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none"
              placeholder="Memo, reference, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {err && <p className="text-sm text-red-500">{err}</p>}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted/40 transition-colors"
          >Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={busy || amount <= 0}
            className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {busy ? "Saving…" : `Record ${amount > 0 ? fmt(amount) : "Payout"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function ConsignersClient({ consigners }: { consigners: Consigner[] }) {
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<EditForm>(blankEditForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(blankEditForm());
  const [copied, setCopied] = useState<string | null>(null);
  const [salesOpen, setSalesOpen] = useState<string | null>(null);
  const [payoutsOpen, setPayoutsOpen] = useState<string | null>(null);
  const [receiveCardsFor, setReceiveCardsFor] = useState<Consigner | null>(null);
  const [recordPayoutFor, setRecordPayoutFor] = useState<Consigner | null>(null);

  async function onAdd() {
    if (!addForm.name.trim()) return;
    setBusy(true);
    try {
      await createConsigner({
        name: addForm.name,
        rate: Number(addForm.rate) / 100,
        phone: addForm.phone || null,
        notes: addForm.notes || null,
      });
      setAddForm(blankEditForm());
      setShowAdd(false);
    } finally { setBusy(false); }
  }

  async function onSaveEdit(id: string) {
    if (!editForm.name.trim()) return;
    setBusy(true);
    try {
      await updateConsigner(id, {
        name: editForm.name,
        rate: Number(editForm.rate) / 100,
        phone: editForm.phone || null,
        notes: editForm.notes || null,
      });
      setEditingId(null);
    } finally { setBusy(false); }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this consigner? Their items will lose the consigner tag.")) return;
    setBusy(true);
    try { await deleteConsigner(id); }
    finally { setBusy(false); }
  }

  function copyLink(token: string) {
    navigator.clipboard.writeText(portalUrl(token));
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Add button */}
      <div className="flex justify-end">
        <button
          className="px-4 py-2 rounded-lg border font-medium text-sm"
          onClick={() => setShowAdd(true)}
          disabled={busy}
        >
          + New Consigner
        </button>
      </div>

      {/* Add modal */}
      {showAdd && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAdd(false); }}
        >
          <div className="bg-background border rounded-2xl w-full max-w-sm p-4 space-y-3">
            <div className="font-semibold">New Consigner</div>
            <ConsignerFormFields form={addForm} setForm={setAddForm} />
            <div className="flex gap-2">
              <button className="flex-1 px-4 py-2 rounded-lg border font-medium" onClick={onAdd} disabled={busy}>
                {busy ? "Saving…" : "Create"}
              </button>
              <button className="px-4 py-2 rounded-lg border opacity-60" onClick={() => setShowAdd(false)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingId && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setEditingId(null); }}
        >
          <div className="bg-background border rounded-2xl w-full max-w-sm p-4 space-y-3">
            <div className="font-semibold">Edit Consigner</div>
            <ConsignerFormFields form={editForm} setForm={setEditForm} />
            <div className="flex gap-2">
              <button className="flex-1 px-4 py-2 rounded-lg border font-medium" onClick={() => onSaveEdit(editingId)} disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
              <button className="px-4 py-2 rounded-lg border opacity-60" onClick={() => setEditingId(null)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Receive Cards modal */}
      {receiveCardsFor && (
        <ReceiveCardsModal
          consigner={receiveCardsFor}
          onClose={() => setReceiveCardsFor(null)}
        />
      )}

      {/* Record Payout modal */}
      {recordPayoutFor && (
        <RecordPayoutModal
          consigner={recordPayoutFor}
          onClose={() => setRecordPayoutFor(null)}
        />
      )}

      {/* Empty state */}
      {consigners.length === 0 && (
        <div className="border rounded-xl p-6 text-sm opacity-70">No consigners yet.</div>
      )}

      {/* Consigner cards */}
      <div className="space-y-4">
        {consigners.map((c) => {
          const totalSoldRevenue = c.sales.reduce((s, it) => s + (it.sold_price ?? 0), 0);
          const totalConsignerCut = c.sales.reduce((s, it) => s + (it.consigner_payout ?? 0), 0);
          const totalOurCut = totalSoldRevenue - totalConsignerCut;

          return (
            <div key={c.id} className="border rounded-xl overflow-hidden">
              {/* Card header */}
              <div className="px-4 py-4 flex items-start gap-3">
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${avatarColor(c.name)}`}>
                  {initials(c.name)}
                </div>

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-base">{c.name}</div>
                  <div className="text-xs opacity-60 mt-0.5 flex flex-wrap gap-x-2">
                    <span>{Math.round(c.rate * 100)}% consigner rate</span>
                    {c.phone && <span>· {c.phone}</span>}
                  </div>
                  {c.notes && <div className="text-xs opacity-50 mt-1">{c.notes}</div>}
                </div>

                {/* Edit / Delete */}
                <div className="flex gap-1 shrink-0">
                  <button
                    className="text-xs px-2 py-1 rounded-lg border"
                    onClick={() => { setEditingId(c.id); setEditForm(consignerToForm(c)); }}
                    disabled={busy}
                  >Edit</button>
                  <button
                    className="text-xs px-2 py-1 rounded-lg border border-red-300 text-red-600"
                    onClick={() => onDelete(c.id)}
                    disabled={busy}
                  >Del</button>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2 px-4 pb-4">
                <div className="border rounded-lg px-3 py-2.5 space-y-0.5">
                  <div className="text-[11px] opacity-50 font-medium uppercase tracking-wide">Active Items</div>
                  <div className="font-semibold">{c.active_count}</div>
                  {c.active_market_value > 0 && (
                    <div className="text-xs opacity-60">{fmt(c.active_market_value)} market value</div>
                  )}
                </div>
                <div className="border rounded-lg px-3 py-2.5 space-y-0.5">
                  <div className="text-[11px] opacity-50 font-medium uppercase tracking-wide">Sold Items</div>
                  <div className="font-semibold">{c.sold_count}</div>
                  {c.sold_revenue > 0 && (
                    <div className="text-xs opacity-60">{fmt(c.sold_revenue)} revenue</div>
                  )}
                </div>
                <div className="border rounded-lg px-3 py-2.5 space-y-0.5">
                  <div className="text-[11px] opacity-50 font-medium uppercase tracking-wide">Pending Payout</div>
                  <div className={`font-semibold ${c.pending_payout > 0 ? "text-amber-500" : ""}`}>
                    {c.pending_payout > 0 ? fmt(c.pending_payout) : "—"}
                  </div>
                  {c.pending_payout > 0 && (
                    <div className="text-xs opacity-50">owed to {c.name.split(" ")[0]}</div>
                  )}
                </div>
                <div className="border rounded-lg px-3 py-2.5 space-y-0.5">
                  <div className="text-[11px] opacity-50 font-medium uppercase tracking-wide">Total Paid Out</div>
                  <div className={`font-semibold ${c.total_paid_out > 0 ? "text-emerald-500" : ""}`}>
                    {c.total_paid_out > 0 ? fmt(c.total_paid_out) : "—"}
                  </div>
                  {c.total_paid_out > 0 && (
                    <div className="text-xs opacity-50">{c.payouts.length} payment{c.payouts.length !== 1 ? "s" : ""}</div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="border-t px-4 py-3 grid grid-cols-2 gap-2">
                <button
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-violet-500/40 bg-violet-500/10 text-violet-400 text-xs font-medium hover:bg-violet-500/20 transition-colors"
                  onClick={() => setReceiveCardsFor(c)}
                >
                  + Receive Cards
                </button>
                <button
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                    c.pending_payout > 0
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                      : "border-border opacity-50 hover:opacity-80"
                  }`}
                  onClick={() => setRecordPayoutFor(c)}
                >
                  $ Record Payout
                </button>
                <a
                  href="/protected/inventory"
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium hover:bg-muted/40 transition-colors"
                >
                  View Items
                </a>
                <button
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium hover:bg-muted/40 transition-colors"
                  onClick={() => copyLink(c.token)}
                >
                  {copied === c.token ? "✓ Copied!" : "Copy Portal Link"}
                </button>
              </div>

              {/* Sales history */}
              {c.sales.length > 0 && (
                <div className="border-t">
                  <button
                    className="w-full flex items-center justify-between text-xs font-medium px-4 py-2.5 hover:bg-muted/20 transition-colors"
                    onClick={() => setSalesOpen(salesOpen === c.id ? null : c.id)}
                  >
                    <span className="flex items-center gap-1.5">
                      <span>{salesOpen === c.id ? "▾" : "▸"}</span>
                      Sales history ({c.sales.length})
                    </span>
                    <span className="opacity-50">{fmt(totalSoldRevenue)} total · you kept {fmt(totalOurCut)}</span>
                  </button>

                  {salesOpen === c.id && (
                    <div className="border-t">
                      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-1.5 bg-muted/30 text-xs opacity-50 font-medium">
                        <span>Item</span>
                        <span className="text-right">Sold</span>
                        <span className="text-right">Their cut</span>
                        <span className="text-right">Our cut</span>
                      </div>
                      {c.sales.map((sale, i) => {
                        const ours = (sale.sold_price ?? 0) - (sale.consigner_payout ?? 0);
                        return (
                          <div
                            key={sale.id}
                            className={`grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-2 text-xs ${i > 0 ? "border-t" : ""}`}
                          >
                            <div className="min-w-0">
                              <div className="font-medium truncate">{sale.name}</div>
                              <div className="opacity-50 truncate">
                                {[sale.set_name, sale.card_number ? `#${sale.card_number}` : ""].filter(Boolean).join(" · ") || fmtDate(sale.sold_at)}
                              </div>
                              {(sale.set_name || sale.card_number) && (
                                <div className="opacity-40">{fmtDate(sale.sold_at)}</div>
                              )}
                            </div>
                            <div className="text-right font-medium">{fmt(sale.sold_price)}</div>
                            <div className="text-right text-emerald-500 font-medium">{fmt(sale.consigner_payout)}</div>
                            <div className="text-right opacity-70">{fmt(ours)}</div>
                          </div>
                        );
                      })}
                      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-2 border-t bg-muted/20 text-xs font-semibold">
                        <span>Total</span>
                        <span className="text-right">{fmt(totalSoldRevenue)}</span>
                        <span className="text-right text-emerald-500">{fmt(totalConsignerCut)}</span>
                        <span className="text-right">{fmt(totalOurCut)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Payout history */}
              {c.payouts.length > 0 && (
                <div className="border-t">
                  <button
                    className="w-full flex items-center justify-between text-xs font-medium px-4 py-2.5 hover:bg-muted/20 transition-colors"
                    onClick={() => setPayoutsOpen(payoutsOpen === c.id ? null : c.id)}
                  >
                    <span className="flex items-center gap-1.5">
                      <span>{payoutsOpen === c.id ? "▾" : "▸"}</span>
                      Payout history ({c.payouts.length})
                    </span>
                    <span className="opacity-50">{fmt(c.total_paid_out)} total paid</span>
                  </button>

                  {payoutsOpen === c.id && (
                    <div className="border-t">
                      <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-1.5 bg-muted/30 text-xs opacity-50 font-medium">
                        <span>Date</span>
                        <span className="text-right">Method</span>
                        <span className="text-right">Amount</span>
                      </div>
                      {c.payouts.map((p, i) => (
                        <div
                          key={p.id}
                          className={`grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-2.5 text-xs ${i > 0 ? "border-t" : ""}`}
                        >
                          <div>
                            <div>{fmtDate(p.date)}</div>
                            {p.notes && <div className="opacity-40 mt-0.5">{p.notes}</div>}
                          </div>
                          <div className="text-right opacity-60 capitalize">{p.payment_method ?? "—"}</div>
                          <div className="text-right font-semibold text-emerald-500">{fmt(p.amount)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Portal link footer */}
              <div className="border-t px-4 py-2.5 flex items-center gap-2">
                <div className="flex-1 text-xs opacity-40 truncate font-mono">
                  /consigner/{c.token.slice(0, 12)}…
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { createConsigner, updateConsigner, deleteConsigner } from "./actions";

export type SoldItem = {
  id: string;
  name: string;
  sold_price: number | null;
  consigner_payout: number | null;
  sold_at: string | null;
  set_name: string | null;
  card_number: string | null;
};

export type Consigner = {
  id: string;
  name: string;
  rate: number;
  phone: string | null;
  notes: string | null;
  token: string;
  created_at: string;
  item_count: number;
  pending_payout: number;
  sales: SoldItem[];
};

type Form = { name: string; rate: string; phone: string; notes: string };

const blank = (): Form => ({ name: "", rate: "85", phone: "", notes: "" });

function consignerToForm(c: Consigner): Form {
  return {
    name: c.name,
    rate: String(Math.round(c.rate * 100)),
    phone: c.phone ?? "",
    notes: c.notes ?? "",
  };
}

function portalUrl(token: string) {
  return `${typeof window !== "undefined" ? window.location.origin : ""}/consigner/${token}`;
}

function fmt(v: number | null) {
  if (v == null) return "—";
  return `$${v.toFixed(2)}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function ConsignersClient({ consigners }: { consigners: Consigner[] }) {
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<Form>(blank());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Form>(blank());
  const [copied, setCopied] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);

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
      setAddForm(blank());
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
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
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
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
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

      {/* Consigner list */}
      {consigners.length === 0 && (
        <div className="border rounded-xl p-6 text-sm opacity-70">No consigners yet.</div>
      )}

      <div className="space-y-3">
        {consigners.map((c) => {
          const totalSold = c.sales.reduce((s, it) => s + (it.sold_price ?? 0), 0);
          const totalPayout = c.sales.reduce((s, it) => s + (it.consigner_payout ?? 0), 0);
          const totalOurs = totalSold - totalPayout;

          return (
            <div key={c.id} className="border rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-xs opacity-60 mt-0.5 space-x-2">
                    <span>{Math.round(c.rate * 100)}% consigner rate</span>
                    {c.phone && <span>• {c.phone}</span>}
                  </div>
                  {c.notes && <div className="text-xs opacity-50 mt-1">{c.notes}</div>}
                </div>
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

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="border rounded-lg px-3 py-2">
                  <div className="opacity-60">Active items</div>
                  <div className="font-semibold">{c.item_count}</div>
                </div>
                <div className="border rounded-lg px-3 py-2">
                  <div className="opacity-60">Pending payout</div>
                  <div className="font-semibold text-green-600">
                    {c.pending_payout > 0 ? `$${c.pending_payout.toFixed(2)}` : "—"}
                  </div>
                </div>
              </div>

              {/* Sales history toggle */}
              {c.sales.length > 0 && (
                <div>
                  <button
                    className="w-full flex items-center justify-between text-xs font-medium px-3 py-2 border rounded-lg hover:bg-muted/40 transition-colors"
                    onClick={() => setHistoryOpen(historyOpen === c.id ? null : c.id)}
                  >
                    <span className="flex items-center gap-1.5">
                      <span>{historyOpen === c.id ? "▾" : "▸"}</span>
                      Sales history ({c.sales.length})
                    </span>
                    <span className="opacity-60">{fmt(totalSold)} total sold</span>
                  </button>

                  {historyOpen === c.id && (
                    <div className="mt-2 border rounded-lg overflow-hidden">
                      {/* Header */}
                      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-1.5 bg-muted/30 text-xs opacity-60 font-medium">
                        <span>Item</span>
                        <span className="text-right">Sold</span>
                        <span className="text-right">Their cut</span>
                        <span className="text-right">Our cut</span>
                      </div>

                      {/* Rows */}
                      {c.sales.map((sale, i) => {
                        const ours = (sale.sold_price ?? 0) - (sale.consigner_payout ?? 0);
                        return (
                          <div
                            key={sale.id}
                            className={`grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2 text-xs ${i > 0 ? "border-t" : ""}`}
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
                            <div className="text-right text-green-600 font-medium">{fmt(sale.consigner_payout)}</div>
                            <div className="text-right opacity-70">{fmt(ours)}</div>
                          </div>
                        );
                      })}

                      {/* Totals */}
                      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2 border-t bg-muted/20 text-xs font-semibold">
                        <span>Total</span>
                        <span className="text-right">{fmt(totalSold)}</span>
                        <span className="text-right text-green-600">{fmt(totalPayout)}</span>
                        <span className="text-right">{fmt(totalOurs)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Portal link */}
              <div className="flex items-center gap-2">
                <div className="flex-1 text-xs opacity-50 truncate">
                  Portal: /consigner/{c.token.slice(0, 8)}…
                </div>
                <button
                  className="text-xs px-3 py-1 rounded-lg border shrink-0"
                  onClick={() => copyLink(c.token)}
                >
                  {copied === c.token ? "Copied!" : "Copy link"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConsignerFormFields({ form, setForm }: { form: Form; setForm: (f: Form) => void }) {
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

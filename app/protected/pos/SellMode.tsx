"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { MoneyDisplay } from "@/components/ui";
import { offlineRecordSell } from "@/lib/offlineAwareActions";
import { allocateBundle, round2, type PickItem } from "./ledger";
import ItemPicker from "./ItemPicker";
import TransactionForm from "./TransactionForm";

// ── Sell ──
// One total across the picked items. With more than one, each line shows its
// allocation (in proportion to FMV, cents exact, remainder to the highest-FMV
// line). Any line can be overridden; the rest re-balance over what is left.
export default function SellMode({ showId, items, initial = [] }: {
  showId: string | null;
  items: PickItem[];
  initial?: PickItem[];
}) {
  const [selected, setSelected] = useState<PickItem[]>(initial);
  const [typedTotal, setTypedTotal] = useState<number | null>(null);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<Record<string, string>>({});

  const suggested = round2(selected.reduce((s, it) => s + (it.market ?? 0), 0));
  const total = typedTotal ?? suggested;
  const alloc = useMemo(() => allocateBundle(total, selected, overrides), [total, selected, overrides]);

  const toggle = (it: PickItem) => {
    setSelected((s) => (s.some((x) => x.id === it.id) ? s.filter((x) => x.id !== it.id) : [...s, it]));
    setOverrides((o) => { const n = { ...o }; delete n[it.id]; return n; });
  };
  const reset = () => { setSelected([]); setOverrides({}); setEditing({}); setTypedTotal(null); };

  return (
    <div className="space-y-3">
      <ItemPicker items={items} selected={selected} onToggle={toggle} />

      {selected.length > 1 && (
        <div className="overflow-hidden rounded-2xl bg-surface">
          <div className="flex h-9 items-center justify-between px-3 text-xs text-muted-foreground">
            <span>Allocation</span>
            <span className="tabular-nums"><MoneyDisplay amount={total} tone="neutral" /> total</span>
          </div>
          {selected.map((it) => {
            const fixed = overrides[it.id] != null;
            const shown = editing[it.id] ?? (alloc[it.id] ?? 0).toFixed(2);
            return (
              <div key={it.id} className="flex h-12 items-center gap-2 border-t border-border px-3">
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{it.name}</span>
                {fixed ? (
                  <button type="button" aria-label="Back to auto" title="Back to auto"
                    onClick={() => { setOverrides((o) => { const n = { ...o }; delete n[it.id]; return n; }); setEditing((e) => { const n = { ...e }; delete n[it.id]; return n; }); }}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
                    <RotateCcw size={14} />
                  </button>
                ) : <span className="w-9 text-center text-xs text-muted-foreground">auto</span>}
                <div className={`flex h-9 items-center rounded-xl bg-surface-2 ${fixed ? "ring-1 ring-accent" : ""}`}>
                  <span className="pl-2 text-xs text-muted-foreground">$</span>
                  <input
                    inputMode="decimal"
                    aria-label={`Price for ${it.name}`}
                    value={shown}
                    onChange={(e) => {
                      setEditing((m) => ({ ...m, [it.id]: e.target.value }));
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) setOverrides((o) => ({ ...o, [it.id]: v }));
                    }}
                    onBlur={() => setEditing((m) => { const n = { ...m }; delete n[it.id]; return n; })}
                    className={`w-20 bg-transparent py-1 pr-2 text-right text-sm tabular-nums outline-none ${fixed ? "text-foreground" : "text-muted-foreground"}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TransactionForm
        mode="sell"
        ready={selected.length > 0}
        suggested={suggested}
        onAmountChange={setTypedTotal}
        onDone={reset}
        submit={(f) => offlineRecordSell({
          itemIds: selected.map((it) => it.id), total: f.amount, show_session_id: showId,
          prices: allocateBundle(f.amount, selected, overrides),
          payment_method: f.payment_method, counterparty: f.counterparty, notes: f.notes,
        })}
      />
    </div>
  );
}

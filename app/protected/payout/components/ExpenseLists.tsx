"use client";

import { SectionHeader } from "@/components/ui";
import type { ExpenseEntry, ItemCostEntry } from "../PayoutServer";
import { CollapsibleSection, LedgerRow } from "./CollapsibleSection";
import { BTN_OUTLINE, fmtDate } from "./payoutMeta";

// ── Partner spend: expenses + unsold inventory each partner fronted ──

function sum(rows: { cost: number }[]) {
  return rows.reduce((s, r) => s + r.cost, 0);
}

function ExpenseSection({ title, rows }: { title: string; rows: ExpenseEntry[] }) {
  if (rows.length === 0) return null;
  return (
    <CollapsibleSection title={title} count={rows.length} subtotal={sum(rows)}>
      {rows.map((e) => (
        <LedgerRow key={e.id} label={e.description} sub={fmtDate(e.created_at)} amount={e.cost} />
      ))}
    </CollapsibleSection>
  );
}

function PurchaseSection({
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
  if (items.length === 0) return null;
  return (
    <CollapsibleSection
      title={title}
      count={items.length}
      subtotal={sum(items)}
      hint="Unsold inventory bought with personal cash. Keep an item solo to leave it out of the split."
    >
      {items.map((item) => {
        const pending = pendingSolo.has(item.id);
        return (
          <LedgerRow
            key={item.id}
            label={item.name}
            sub={`Inventory cost · ${fmtDate(item.created_at)}`}
            amount={item.cost}
            action={
              <button
                type="button"
                disabled={pending}
                onClick={() => onKeepSolo(item.id)}
                className={`${BTN_OUTLINE} shrink-0 text-xs`}
              >
                {pending ? "Saving…" : "Keep solo"}
              </button>
            }
          />
        );
      })}
    </CollapsibleSection>
  );
}

export function ExpenseLists({
  alexExpenses,
  milaExpenses,
  alexItems,
  milaItems,
  pendingSolo,
  onKeepSolo,
}: {
  alexExpenses: ExpenseEntry[];
  milaExpenses: ExpenseEntry[];
  alexItems: ItemCostEntry[];
  milaItems: ItemCostEntry[];
  pendingSolo: Set<string>;
  onKeepSolo: (id: string) => void;
}) {
  const total = alexExpenses.length + milaExpenses.length + alexItems.length + milaItems.length;
  if (total === 0) return null;

  return (
    <section className="space-y-3">
      <SectionHeader>Partner spend</SectionHeader>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        <ExpenseSection title="Alex's expenses" rows={alexExpenses} />
        <PurchaseSection
          title="Alex's inventory"
          items={alexItems}
          pendingSolo={pendingSolo}
          onKeepSolo={onKeepSolo}
        />
        <ExpenseSection title="Mila's expenses" rows={milaExpenses} />
        <PurchaseSection
          title="Mila's inventory"
          items={milaItems}
          pendingSolo={pendingSolo}
          onKeepSolo={onKeepSolo}
        />
      </div>
    </section>
  );
}

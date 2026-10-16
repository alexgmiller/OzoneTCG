"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { EmptyState, MoneyDisplay } from "@/components/ui";
import type { PickItem } from "./ledger";
import { INPUT } from "./ui";

// Pick inventory by name, set, number or cert; selected items stay pinned on top
export default function ItemPicker({ items, selected, onToggle }: {
  items: PickItem[];
  selected: PickItem[];
  onToggle: (item: PickItem) => void;
}) {
  const [q, setQ] = useState("");
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const picked = new Set(selected.map((s) => s.id));
  const matches = terms.length
    ? items.filter((it) => !picked.has(it.id) && terms.every((t) =>
        [it.name, it.set_name, it.card_number, it.cert_number, it.grade].some((f) => f?.toLowerCase().includes(t))))
    : [];

  const row = (it: PickItem, on: boolean) => (
    <button key={it.id} type="button" onClick={() => onToggle(it)} aria-pressed={on}
      className={`flex h-16 w-full items-center gap-3 rounded-2xl px-3 text-left transition-colors duration-150 ${
        on ? "bg-accent-tint" : "bg-surface hover:bg-surface-2"
      }`}>
      <span className="h-14 w-10 shrink-0 overflow-hidden rounded-thumb bg-surface-2">
        {it.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={it.image_url} alt="" className="h-full w-full object-cover" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{it.name}</span>
        <span className="block truncate font-mono text-xs text-muted-foreground">
          {[it.set_name, it.card_number && `#${it.card_number}`, it.grade].filter(Boolean).join(" · ")}
        </span>
      </span>
      {it.market != null
        ? <MoneyDisplay amount={it.market} tone="neutral" className="shrink-0 text-sm font-bold text-foreground" />
        : <span className="shrink-0 text-sm text-muted-foreground">—</span>}
      {on && <Check size={18} className="shrink-0 text-accent" aria-hidden />}
    </button>
  );

  return (
    <div className="space-y-2">
      {selected.map((it) => row(it, true))}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search inventory or cert #"
        aria-label="Search inventory" className={`${INPUT} w-full`} />
      {terms.length === 0 && selected.length === 0 && (
        <EmptyState title="Pick cards from inventory" hint="Search by name, set, number or cert #." />
      )}
      {terms.length > 0 && matches.length === 0 && (
        <EmptyState title="No cards match" hint="Try fewer words, or the cert number." />
      )}
      {matches.slice(0, 25).map((it) => row(it, false))}
    </div>
  );
}

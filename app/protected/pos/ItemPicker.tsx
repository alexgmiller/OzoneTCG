"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type { PickItem } from "./ledger";

const money = (n: number | null) => (n == null ? "—" : `$${n.toFixed(2)}`);

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
    <button key={it.id} type="button" onClick={() => onToggle(it)}
      className={`w-full flex items-center gap-3 p-2 rounded-lg border text-left ${on ? "border-primary bg-primary/5" : ""}`}>
      {it.image_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={it.image_url} alt="" className="w-9 h-12 object-cover rounded" />
        : <div className="w-9 h-12 rounded bg-muted" />}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{it.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {[it.set_name, it.card_number && `#${it.card_number}`, it.grade].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div className="text-sm tabular-nums">{money(it.market)}</div>
      {on && <Check size={16} className="text-primary" />}
    </button>
  );

  return (
    <div className="space-y-2">
      {selected.map((it) => row(it, true))}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search inventory or cert #"
        className="w-full h-11 border rounded-lg px-3 text-sm bg-background" />
      {matches.slice(0, 25).map((it) => row(it, false))}
    </div>
  );
}

"use client";

import { useState } from "react";
import { X } from "lucide-react";
import CardAutocomplete from "@/components/CardAutocomplete";
import CertLookupWidget from "@/components/CertLookupWidget";
import { offlineRecordBuy } from "@/lib/offlineAwareActions";
import { round2, type NewCard } from "./ledger";
import TransactionForm from "./TransactionForm";

const CATEGORIES = ["single", "slab", "sealed"] as const;

// Adds a customer's card: search by name, or scan a slab's cert
export function CardEntry({ onAdd }: { onAdd: (c: NewCard) => void }) {
  const [category, setCategory] = useState<NewCard["category"]>("single");
  const [name, setName] = useState("");
  const [market, setMarket] = useState("");
  const [card, setCard] = useState<Partial<NewCard>>({});

  function add(c: NewCard) {
    onAdd(c);
    setName(""); setMarket(""); setCard({});
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" onClick={() => setCategory(c)}
            className={`h-9 px-3 rounded-lg border text-sm capitalize ${category === c ? "border-primary text-primary" : ""}`}>
            {c}
          </button>
        ))}
      </div>
      {category === "slab" && (
        <CertLookupWidget label="Scan cert" onResult={(r) => add({
          name: r.name, category: "slab", market: r.market, cert_number: r.certNumber,
          grade: [r.company, r.gradeLabel, r.grade].filter(Boolean).join(" "),
          set_name: r.setName, card_number: r.cardNumber,
        })} />
      )}
      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          <CardAutocomplete value={name} placeholder="Card name"
            className="w-full h-11 border rounded-lg px-3 text-sm bg-background"
            onChange={(v) => { setName(v); setCard({}); }}
            onSelect={(c) => {
              setName(c.name);
              setCard({ set_name: c.setName, card_number: c.cardNumber, image_url: c.imageUrl });
              if (c.market != null) setMarket(c.market.toFixed(2));
            }} />
        </div>
        <input type="number" inputMode="decimal" value={market} onChange={(e) => setMarket(e.target.value)}
          placeholder="Market" aria-label="Market price" className="w-24 h-11 border rounded-lg px-2 text-sm bg-background" />
        <button type="button" disabled={!name.trim()} className="h-11 px-4 rounded-lg border font-medium disabled:opacity-40"
          onClick={() => add({ ...card, name: name.trim(), category, market: market ? Number(market) : null })}>
          Add
        </button>
      </div>
    </div>
  );
}

export function CardList({ cards, onRemove }: { cards: NewCard[]; onRemove: (i: number) => void }) {
  return (
    <div className="space-y-1">
      {cards.map((c, i) => (
        <div key={i} className="flex items-center gap-2 text-sm border rounded-lg px-3 h-11">
          <span className="flex-1 truncate">{c.name}{c.grade ? ` · ${c.grade}` : ""}</span>
          <span className="tabular-nums">{c.market != null ? `$${c.market.toFixed(2)}` : "—"}</span>
          <button type="button" aria-label="Remove" onClick={() => onRemove(i)}><X size={16} /></button>
        </div>
      ))}
    </div>
  );
}

export default function BuyMode({ showId, buyPct }: { showId: string | null; buyPct: number }) {
  const [cards, setCards] = useState<NewCard[]>([]);
  const market = cards.reduce((s, c) => s + (c.market ?? 0), 0);

  return (
    <div className="space-y-3">
      <CardEntry onAdd={(c) => setCards((cs) => [...cs, c])} />
      <CardList cards={cards} onRemove={(i) => setCards((cs) => cs.filter((_, j) => j !== i))} />
      <TransactionForm mode="buy" ready={cards.length > 0} suggested={round2((market * buyPct) / 100)}
        onDone={() => setCards([])}
        submit={(f) => offlineRecordBuy({
          cards, total: f.amount, paid_by: f.paid_by, show_session_id: showId,
          payment_method: f.payment_method, counterparty: f.counterparty, notes: f.notes,
        })} />
    </div>
  );
}

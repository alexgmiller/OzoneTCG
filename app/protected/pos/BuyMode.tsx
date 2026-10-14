"use client";

import { useState } from "react";
import { X } from "lucide-react";
import CardAutocomplete from "@/components/CardAutocomplete";
import CertLookupWidget from "@/components/CertLookupWidget";
import { EmptyState, MoneyDisplay } from "@/components/ui";
import { offlineRecordBuy } from "@/lib/offlineAwareActions";
import { round2, type NewCard } from "./ledger";
import { BTN, ICON_BTN, INPUT, chip } from "./ui";
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
      <div className="flex gap-2" role="radiogroup" aria-label="Category">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={category === c} onClick={() => setCategory(c)}
            className={`${chip(category === c)} capitalize`}>
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
        <div className="min-w-0 flex-1">
          <CardAutocomplete value={name} placeholder="Card name"
            className={`${INPUT} w-full`}
            onChange={(v) => { setName(v); setCard({}); }}
            onSelect={(c) => {
              setName(c.name);
              setCard({ set_name: c.setName, card_number: c.cardNumber, image_url: c.imageUrl });
              if (c.market != null) setMarket(c.market.toFixed(2));
            }} />
        </div>
        <input type="number" inputMode="decimal" value={market} onChange={(e) => setMarket(e.target.value)}
          placeholder="Market" aria-label="Market price" className={`${INPUT} w-24 tabular-nums`} />
        <button type="button" disabled={!name.trim()} className={BTN}
          onClick={() => add({ ...card, name: name.trim(), category, market: market ? Number(market) : null })}>
          Add
        </button>
      </div>
    </div>
  );
}

export function CardList({ cards, onRemove }: { cards: NewCard[]; onRemove: (i: number) => void }) {
  if (cards.length === 0) return null;
  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-card">
      {cards.map((c, i) => (
        <div key={i} className="flex min-h-14 items-center gap-3 py-1 pl-3 pr-1 text-sm">
          <span className="min-w-0 flex-1 truncate text-foreground">{c.name}{c.grade ? ` · ${c.grade}` : ""}</span>
          {c.market != null
            ? <MoneyDisplay amount={c.market} tone="neutral" className="shrink-0 text-foreground" />
            : <span className="shrink-0 text-muted-foreground">—</span>}
          <button type="button" aria-label={`Remove ${c.name}`} onClick={() => onRemove(i)} className={ICON_BTN}>
            <X size={16} />
          </button>
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
      {cards.length === 0 ? (
        <EmptyState title="No cards added" hint="Search a card above, or pick Slab to scan a cert." />
      ) : (
        <CardList cards={cards} onRemove={(i) => setCards((cs) => cs.filter((_, j) => j !== i))} />
      )}
      <TransactionForm mode="buy" ready={cards.length > 0} suggested={round2((market * buyPct) / 100)}
        onDone={() => setCards([])}
        submit={(f) => offlineRecordBuy({
          cards, total: f.amount, paid_by: f.paid_by, show_session_id: showId,
          payment_method: f.payment_method, counterparty: f.counterparty, notes: f.notes,
        })} />
    </div>
  );
}

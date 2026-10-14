"use client";

import { useState } from "react";
import { offlineRecordTrade } from "@/lib/offlineAwareActions";
import { round2, type NewCard, type PickItem } from "./ledger";
import { CardEntry, CardList } from "./BuyMode";
import ItemPicker from "./ItemPicker";
import TransactionForm from "./TransactionForm";

const total = (xs: (number | null)[]) => round2(xs.reduce<number>((s, x) => s + (x ?? 0), 0));

// Outgoing cards are valued at market; the cash line settles the difference
export default function TradeMode({ showId, items, initial = [] }: {
  showId: string | null;
  items: PickItem[];
  initial?: PickItem[];
}) {
  const [out, setOut] = useState<PickItem[]>(initial);
  const [incoming, setIncoming] = useState<NewCard[]>([]);
  const gave = total(out.map((it) => it.market));
  const got = total(incoming.map((c) => c.market));

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">Giving · ${gave.toFixed(2)}</h3>
      <ItemPicker items={items} selected={out}
        onToggle={(it) => setOut((s) => (s.some((x) => x.id === it.id) ? s.filter((x) => x.id !== it.id) : [...s, it]))} />
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">Getting · ${got.toFixed(2)}</h3>
      <CardEntry onAdd={(c) => setIncoming((cs) => [...cs, c])} />
      <CardList cards={incoming} onRemove={(i) => setIncoming((cs) => cs.filter((_, j) => j !== i))} />
      {got !== gave && (
        <p className="text-sm">At market, {got > gave ? "we owe them" : "they owe us"} ${Math.abs(round2(got - gave)).toFixed(2)}</p>
      )}
      <TransactionForm mode="trade" ready={out.length + incoming.length > 0}
        suggested={Math.abs(round2(got - gave))}
        onDone={() => { setOut([]); setIncoming([]); }}
        submit={(f) => offlineRecordTrade({
          goingOut: out.map((it) => ({ itemId: it.id, value: it.market ?? 0 })),
          comingIn: incoming, cashDifference: f.amount, paid_by: f.paid_by, show_session_id: showId,
          payment_method: f.payment_method, counterparty: f.counterparty, notes: f.notes,
        })} />
    </div>
  );
}

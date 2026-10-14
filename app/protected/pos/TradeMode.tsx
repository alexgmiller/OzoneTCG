"use client";

import { useState } from "react";
import { MoneyDisplay, SectionHeader } from "@/components/ui";
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
  const diff = Math.abs(round2(got - gave));

  return (
    <div className="space-y-4">
      {/* ── Giving ── */}
      <section className="space-y-3">
        <SectionHeader action={<MoneyDisplay amount={gave} tone="neutral" className="text-sm text-foreground" />}>
          Giving
        </SectionHeader>
        <ItemPicker items={items} selected={out}
          onToggle={(it) => setOut((s) => (s.some((x) => x.id === it.id) ? s.filter((x) => x.id !== it.id) : [...s, it]))} />
      </section>

      {/* ── Getting ── */}
      <section className="space-y-3">
        <SectionHeader action={<MoneyDisplay amount={got} tone="neutral" className="text-sm text-foreground" />}>
          Getting
        </SectionHeader>
        <CardEntry onAdd={(c) => setIncoming((cs) => [...cs, c])} />
        <CardList cards={incoming} onRemove={(i) => setIncoming((cs) => cs.filter((_, j) => j !== i))} />
      </section>

      {got !== gave && (
        <p className="text-sm text-muted-foreground">
          At market, {got > gave ? "we owe them" : "they owe us"}{" "}
          <MoneyDisplay amount={diff} tone="neutral" className="font-semibold text-foreground" />
        </p>
      )}

      <TransactionForm mode="trade" ready={out.length + incoming.length > 0}
        suggested={diff}
        onDone={() => { setOut([]); setIncoming([]); }}
        submit={(f) => offlineRecordTrade({
          goingOut: out.map((it) => ({ itemId: it.id, value: it.market ?? 0 })),
          comingIn: incoming, cashDifference: f.amount, paid_by: f.paid_by, show_session_id: showId,
          payment_method: f.payment_method, counterparty: f.counterparty, notes: f.notes,
        })} />
    </div>
  );
}

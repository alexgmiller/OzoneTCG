"use client";

import { useState } from "react";
import { offlineRecordSell } from "@/lib/offlineAwareActions";
import { round2, type PickItem } from "./ledger";
import ItemPicker from "./ItemPicker";
import TransactionForm from "./TransactionForm";

export default function SellMode({ showId, items, initial = [] }: {
  showId: string | null;
  items: PickItem[];
  initial?: PickItem[];
}) {
  const [selected, setSelected] = useState<PickItem[]>(initial);
  const toggle = (it: PickItem) =>
    setSelected((s) => (s.some((x) => x.id === it.id) ? s.filter((x) => x.id !== it.id) : [...s, it]));

  return (
    <div className="space-y-3">
      <ItemPicker items={items} selected={selected} onToggle={toggle} />
      <TransactionForm mode="sell" ready={selected.length > 0}
        suggested={round2(selected.reduce((s, it) => s + (it.market ?? 0), 0))}
        onDone={() => setSelected([])}
        submit={(f) => offlineRecordSell({
          itemIds: selected.map((it) => it.id), total: f.amount, show_session_id: showId,
          payment_method: f.payment_method, counterparty: f.counterparty, notes: f.notes,
        })} />
    </div>
  );
}

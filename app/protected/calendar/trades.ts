// Pure helpers that fold card_transactions rows into calendar trades.
// One trade = one trade_group_id with at least one trade_in / trade_out row.

import type { TradeEntry } from "./actions";

// ── Row shapes ────────────────────────────────────────────────────────────────

export type TradeCountRow = {
  id: string;
  trade_group_id: string | null;
  date: string;
};

export type TradeDetailRow = TradeCountRow & {
  transaction_type: string;
  notes: string | null;
  show_session_id: string | null;
  card: { name: string | null } | null;
};

const groupOf = (r: TradeCountRow) => r.trade_group_id ?? r.id;
const dayOf = (r: TradeCountRow) => r.date.slice(0, 10);

// ── Month: distinct trades per day ────────────────────────────────────────────

export function countTradesByDay(rows: TradeCountRow[]): Map<string, number> {
  const groups = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.date) continue;
    const day = dayOf(r);
    if (!groups.has(day)) groups.set(day, new Set());
    groups.get(day)!.add(groupOf(r));
  }
  return new Map([...groups].map(([day, ids]) => [day, ids.size]));
}

// ── Day: one entry per trade, "out → in" ──────────────────────────────────────

export function groupTrades(rows: TradeDetailRow[]): TradeEntry[] {
  const byGroup = new Map<string, TradeDetailRow[]>();
  for (const r of rows) {
    const id = groupOf(r);
    if (!byGroup.has(id)) byGroup.set(id, []);
    byGroup.get(id)!.push(r);
  }

  const entries: TradeEntry[] = [];
  for (const [id, group] of byGroup) {
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const names = (type: string) =>
      sorted.filter((r) => r.transaction_type === type).map((r) => r.card?.name?.trim() || "Card");
    const out = names("trade_out").join(", ") || "Cash";
    const inn = names("trade_in").join(", ") || "Cash";
    entries.push({
      id,
      card_name: `${out} → ${inn}`,
      notes: sorted.find((r) => r.notes)?.notes ?? null,
      scanned_at: sorted[0].date,
      deal_photo_url: null,
      show_session_id: sorted.find((r) => r.show_session_id)?.show_session_id ?? null,
    });
  }
  return entries.sort((a, b) => a.scanned_at.localeCompare(b.scanned_at));
}

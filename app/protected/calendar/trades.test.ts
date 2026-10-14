import { describe, expect, it } from "vitest";
import { countTradesByDay, groupTrades, type TradeDetailRow } from "./trades";

const row = (over: Partial<TradeDetailRow>): TradeDetailRow => ({
  id: "r",
  trade_group_id: "g1",
  transaction_type: "trade_out",
  date: "2026-10-13T15:00:00+00:00",
  notes: null,
  show_session_id: null,
  card: { name: "Charizard" },
  ...over,
});

describe("countTradesByDay", () => {
  it("counts one trade per trade_group_id per day", () => {
    const counts = countTradesByDay([
      row({ id: "a", trade_group_id: "g1" }),
      row({ id: "b", trade_group_id: "g1", transaction_type: "trade_in" }),
      row({ id: "c", trade_group_id: "g2" }),
      row({ id: "d", trade_group_id: "g3", date: "2026-10-14T09:00:00+00:00" }),
    ]);
    expect(counts.get("2026-10-13")).toBe(2);
    expect(counts.get("2026-10-14")).toBe(1);
    expect(counts.size).toBe(2);
  });

  it("falls back to the row id when trade_group_id is missing", () => {
    const counts = countTradesByDay([row({ id: "a", trade_group_id: null }), row({ id: "b", trade_group_id: null })]);
    expect(counts.get("2026-10-13")).toBe(2);
  });
});

describe("groupTrades", () => {
  it("builds one 'out → in' entry per deal with the earliest time and first notes", () => {
    const entries = groupTrades([
      row({ id: "a", card: { name: "Pikachu" }, transaction_type: "trade_in", date: "2026-10-13T15:05:00+00:00", show_session_id: "s1" }),
      row({ id: "b", card: { name: "Charizard" }, transaction_type: "trade_out", date: "2026-10-13T15:00:00+00:00", notes: "even swap" }),
      row({ id: "c", card: { name: "Blastoise" }, transaction_type: "trade_out", date: "2026-10-13T15:00:00+00:00" }),
    ]);
    expect(entries).toEqual([{
      id: "g1",
      card_name: "Charizard, Blastoise → Pikachu",
      notes: "even swap",
      scanned_at: "2026-10-13T15:00:00+00:00",
      deal_photo_url: null,
      show_session_id: "s1",
    }]);
  });

  it("labels a one-sided trade as cash and sorts deals by time", () => {
    const entries = groupTrades([
      row({ id: "a", trade_group_id: "late", date: "2026-10-13T18:00:00+00:00" }),
      row({ id: "b", trade_group_id: "early", transaction_type: "trade_in", card: { name: "Mew" }, date: "2026-10-13T10:00:00+00:00" }),
      row({ id: "c", trade_group_id: "early", transaction_type: "trade_in", card: null, date: "2026-10-13T10:00:00+00:00" }),
    ]);
    expect(entries.map((e) => e.id)).toEqual(["early", "late"]);
    expect(entries[0].card_name).toBe("Cash → Mew, Card");
    expect(entries[1].card_name).toBe("Charizard → Cash");
  });
});

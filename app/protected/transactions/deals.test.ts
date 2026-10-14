import { describe, expect, it } from "vitest";
import { groupDeals, type TxRow } from "./deals";

const row = (r: Partial<TxRow>): TxRow => ({
  id: "x", card_id: null, card: null, transaction_type: "buy", trade_group_id: null,
  date: "2026-10-01T10:00:00Z", payment_method: null, counterparty: null, notes: null,
  show_session_id: null, paid_by: null, cash_paid: null, sale_price: null,
  market_price_at_time: null, cash_difference: null, ...r,
});

describe("groupDeals", () => {
  it("folds a deal's rows together and reads deal fields from the lead row", () => {
    const [deal] = groupDeals([
      row({ id: "g", trade_group_id: "g", transaction_type: "trade_out", card: { name: "A" },
        market_price_at_time: 100, cash_difference: 25, payment_method: "cash", counterparty: "Sam" }),
      row({ id: "h", trade_group_id: "g", transaction_type: "trade_in", card: { name: "B" },
        market_price_at_time: 120, cash_difference: 25 }),
    ], new Map([["g", ["p1.jpg"]]]));

    expect(deal).toMatchObject({ id: "g", mode: "trade", amount: 25, method: "cash", counterparty: "Sam", photos: ["p1.jpg"] });
    expect(deal.cards).toEqual([
      { name: "A", direction: "out", value: 100 },
      { name: "B", direction: "in", value: 120 },
    ]);
  });

  it("totals buys and sells across cards and keeps legacy rows separate", () => {
    const deals = groupDeals([
      row({ id: "s1", trade_group_id: "s", transaction_type: "sell", sale_price: 30 }),
      row({ id: "s2", trade_group_id: "s", transaction_type: "sell", sale_price: 20 }),
      row({ id: "old", transaction_type: "buy", cash_paid: 15 }),
    ], new Map());

    expect(deals.map((d) => [d.id, d.mode, d.amount])).toEqual([["s", "sell", 50], ["old", "buy", 15]]);
    expect(deals[1].cards[0].name).toBe("Deleted item");
  });
});

import { describe, expect, it } from "vitest";
import { cardSummary, groupDeals, signedAmount, sortDeals, type Deal, type TxRow } from "./deals";

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

describe("display helpers", () => {
  const deal = (o: Partial<Deal>): Deal => ({
    id: "d", mode: "sell", date: "2026-10-01T10:00:00Z", method: null, counterparty: null, notes: null,
    paidBy: null, showId: null, amount: 0, cards: [], photos: [], ...o,
  });

  it("signs money from our side: sells in, buys and trade cash out", () => {
    expect(signedAmount(deal({ mode: "sell", amount: 50 }))).toBe(50);
    expect(signedAmount(deal({ mode: "buy", amount: 30 }))).toBe(-30);
    expect(signedAmount(deal({ mode: "trade", amount: -10 }))).toBe(10);
  });

  it("summarises more than two cards with a count", () => {
    const cards = ["A", "B", "C", "D"].map((name) => ({ name, direction: "out" as const, value: null }));
    expect(cardSummary(deal({ cards }))).toBe("A, B +2");
    expect(cardSummary(deal({ cards: cards.slice(0, 2) }))).toBe("A, B");
  });

  it("sorts by date or signed amount in either direction", () => {
    const a = deal({ id: "a", date: "2026-10-01", mode: "sell", amount: 10 });
    const b = deal({ id: "b", date: "2026-10-03", mode: "buy", amount: 50 });
    const c = deal({ id: "c", date: "2026-10-02", mode: "sell", amount: 99 });
    const ids = (ds: Deal[]) => ds.map((d) => d.id).join("");
    expect(ids(sortDeals([a, b, c], { key: "date", dir: "desc" }))).toBe("bca");
    expect(ids(sortDeals([a, b, c], { key: "amount", dir: "desc" }))).toBe("cab");
    expect(ids(sortDeals([a, b, c], { key: "amount", dir: "asc" }))).toBe("bac");
  });
});

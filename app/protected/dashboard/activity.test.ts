import { describe, expect, it } from "vitest";
import { computeToday, fmtAgo, groupRecentDeals, localDayKey, type TxRow } from "./activity";

const NOW = new Date(2026, 9, 13, 14, 30); // local time, avoids TZ drift in assertions
const TODAY = localDayKey(NOW);
const iso = (d: Date) => d.toISOString();
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

let seq = 0;
function row(overrides: Partial<TxRow> = {}): TxRow {
  seq += 1;
  return {
    id: `tx-${seq}`,
    trade_group_id: null,
    transaction_type: "sell",
    date: iso(NOW),
    sale_price: null,
    cash_paid: null,
    cost_basis: null,
    cash_difference: null,
    ...overrides,
  };
}

describe("localDayKey", () => {
  it("formats the local calendar day with zero padding", () => {
    expect(localDayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("computeToday — filtering", () => {
  it("returns zeros for no rows", () => {
    expect(computeToday([], TODAY)).toEqual({
      revenue: 0, profit: 0, spent: 0, deals: 0, cardsSold: 0, cardsBought: 0,
    });
  });

  it("ignores rows from other local days", () => {
    const t = computeToday(
      [row({ transaction_type: "sell", sale_price: 100, date: iso(hoursAgo(40)) })],
      TODAY,
    );
    expect(t.revenue).toBe(0);
    expect(t.deals).toBe(0);
  });
});

describe("computeToday — sells", () => {
  it("sums revenue and profit over sell rows", () => {
    const t = computeToday(
      [
        row({ transaction_type: "sell", sale_price: 100, cost_basis: 40, trade_group_id: "g1" }),
        row({ transaction_type: "sell", sale_price: 50, cost_basis: 30, trade_group_id: "g1" }),
      ],
      TODAY,
    );
    expect(t.revenue).toBe(150);
    expect(t.profit).toBe(80);
    expect(t.cardsSold).toBe(2);
    expect(t.deals).toBe(1);
  });

  it("treats a missing cost basis as zero", () => {
    const t = computeToday([row({ transaction_type: "sell", sale_price: 25, cost_basis: null })], TODAY);
    expect(t.profit).toBe(25);
  });
});

describe("computeToday — spent", () => {
  it("sums cash paid on buy rows", () => {
    const t = computeToday(
      [
        row({ transaction_type: "buy", cash_paid: 30, trade_group_id: "b1" }),
        row({ transaction_type: "buy", cash_paid: 20, trade_group_id: "b1" }),
      ],
      TODAY,
    );
    expect(t.spent).toBe(50);
    expect(t.cardsBought).toBe(2);
  });

  it("counts a positive trade cash difference once per trade group", () => {
    const t = computeToday(
      [
        row({ transaction_type: "trade_out", cash_difference: 15, trade_group_id: "t1" }),
        row({ transaction_type: "trade_in", cash_difference: 15, trade_group_id: "t1" }),
        row({ transaction_type: "trade_in", cash_difference: 15, trade_group_id: "t1" }),
      ],
      TODAY,
    );
    expect(t.spent).toBe(15);
    expect(t.deals).toBe(1);
  });

  it("does not count cash the customer paid us on a trade as spend", () => {
    const t = computeToday(
      [row({ transaction_type: "trade_out", cash_difference: -20, trade_group_id: "t2" })],
      TODAY,
    );
    expect(t.spent).toBe(0);
  });
});

describe("computeToday — deals", () => {
  it("counts distinct trade groups, falling back to the row id", () => {
    const t = computeToday(
      [
        row({ transaction_type: "sell", sale_price: 10, trade_group_id: "g1" }),
        row({ transaction_type: "sell", sale_price: 10, trade_group_id: "g1" }),
        row({ transaction_type: "buy", cash_paid: 5, trade_group_id: null }),
        row({ transaction_type: "buy", cash_paid: 5, trade_group_id: null }),
      ],
      TODAY,
    );
    expect(t.deals).toBe(3);
  });
});

describe("groupRecentDeals", () => {
  it("folds rows into deals and keeps newest-first order", () => {
    const deals = groupRecentDeals([
      row({ id: "s1", trade_group_id: "s1", transaction_type: "sell", sale_price: 60, card: { name: "Pikachu" } }),
      row({ trade_group_id: "s1", transaction_type: "sell", sale_price: 40, card: { name: "Eevee" } }),
      row({ id: "b1", trade_group_id: "b1", transaction_type: "buy", cash_paid: 30, card: { name: "Mewtwo" }, date: iso(hoursAgo(2)) }),
    ]);
    expect(deals).toHaveLength(2);
    expect(deals[0]).toMatchObject({ id: "s1", mode: "sell", cardCount: 2, firstName: "Pikachu", amount: 100 });
    expect(deals[1]).toMatchObject({ id: "b1", mode: "buy", cardCount: 1, firstName: "Mewtwo", amount: -30 });
  });

  it("signs a trade by who paid the cash difference", () => {
    const [wePaid] = groupRecentDeals([
      row({ id: "t1", trade_group_id: "t1", transaction_type: "trade_out", cash_difference: 15 }),
      row({ trade_group_id: "t1", transaction_type: "trade_in", cash_difference: 15 }),
    ]);
    expect(wePaid).toMatchObject({ mode: "trade", amount: -15, cardCount: 2 });

    const [theyPaid] = groupRecentDeals([
      row({ id: "t2", trade_group_id: "t2", transaction_type: "trade_in", cash_difference: -25 }),
    ]);
    expect(theyPaid.amount).toBe(25);
  });

  it("respects the limit", () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      row({ id: `d${i}`, trade_group_id: `d${i}`, transaction_type: "sell", sale_price: 1 }));
    expect(groupRecentDeals(rows, 5)).toHaveLength(5);
  });

  it("falls back to the row id for legacy rows without a group", () => {
    const deals = groupRecentDeals([
      row({ id: "legacy", trade_group_id: null, transaction_type: "buy", cash_paid: 12 }),
    ]);
    expect(deals[0]).toMatchObject({ id: "legacy", mode: "buy", amount: -12, firstName: null });
  });
});

describe("fmtAgo", () => {
  it("steps through minutes, hours and days", () => {
    expect(fmtAgo(iso(NOW), NOW)).toBe("just now");
    expect(fmtAgo(iso(new Date(NOW.getTime() - 5 * 60_000)), NOW)).toBe("5m ago");
    expect(fmtAgo(iso(hoursAgo(3)), NOW)).toBe("3h ago");
    expect(fmtAgo(iso(hoursAgo(49)), NOW)).toBe("2d ago");
  });

  it("falls back to a short date after a week", () => {
    expect(fmtAgo(iso(hoursAgo(24 * 10)), NOW)).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });
});

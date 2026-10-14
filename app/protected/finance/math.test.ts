import { describe, expect, it } from "vitest";
import {
  cashDrawer, expensesByCategory, localDay, monthlyPnl, periodPnl, pnlFor, type FinanceExpense, type FinanceTx,
} from "./math";

const tx = (r: Partial<FinanceTx>): FinanceTx => ({
  id: "x", trade_group_id: null, transaction_type: "sell", date: "2026-10-05T18:00:00Z",
  sale_price: null, cost_basis: null, cash_paid: null, cash_difference: null, payment_method: "cash", ...r,
});
const ex = (r: Partial<FinanceExpense>): FinanceExpense => ({
  expense_date: "2026-10-05", cost: 0, category: "other", deductible_percentage: 100, ...r,
});

const TZ = "America/Los_Angeles";

describe("pnlFor", () => {
  it("separates revenue, cost of goods, expenses and inventory spend", () => {
    const p = pnlFor([
      tx({ id: "s1", trade_group_id: "s", sale_price: 100, cost_basis: 40 }),
      tx({ id: "s2", trade_group_id: "s", sale_price: 50, cost_basis: 30 }),
      tx({ id: "b1", trade_group_id: "b", transaction_type: "buy", cash_paid: 70 }),
      tx({ id: "t1", trade_group_id: "t", transaction_type: "trade_out", cash_difference: 25 }),
      tx({ id: "t2", trade_group_id: "t", transaction_type: "trade_in", cash_difference: 25 }),
      tx({ id: "r1", trade_group_id: "r", transaction_type: "trade_in", cash_difference: -10 }),
    ], [ex({ cost: 60, category: "booth_fee" }), ex({ cost: 12.5 })]);

    expect(p).toMatchObject({
      revenue: 150, cogs: 70, grossProfit: 80, expenses: 72.5, net: 7.5,
      buysSpent: 70, tradeCashOut: 25, tradeCashIn: 10, deals: 4, cardsSold: 3, cardsBought: 3,
    });
  });

  it("is all zeros with no activity", () => {
    expect(pnlFor([], []).net).toBe(0);
    expect(pnlFor([], []).deals).toBe(0);
  });
});

describe("cashDrawer", () => {
  it("only counts cash-method deals, trades once", () => {
    const cash = cashDrawer([
      tx({ sale_price: 100 }),
      tx({ id: "v", sale_price: 999, payment_method: "venmo" }),
      tx({ id: "b", transaction_type: "buy", cash_paid: 30 }),
      tx({ id: "t1", trade_group_id: "t", transaction_type: "trade_out", cash_difference: 20 }),
      tx({ id: "t2", trade_group_id: "t", transaction_type: "trade_in", cash_difference: 20 }),
    ]);
    expect(cash).toBe(50);
  });
});

describe("localDay", () => {
  it("uses the business timezone, not UTC", () => {
    expect(localDay("2026-10-06T03:30:00Z", TZ)).toBe("2026-10-05");
    expect(localDay("2026-10-06T12:00:00Z", TZ)).toBe("2026-10-06");
  });
});

describe("monthlyPnl", () => {
  it("returns one bucket per month, oldest first, bucketed by local day", () => {
    const months = monthlyPnl([
      tx({ id: "a", date: "2026-10-01T04:00:00Z", sale_price: 10 }), // Sep 30 in LA
      tx({ id: "b", date: "2026-10-15T20:00:00Z", sale_price: 20 }),
    ], [ex({ expense_date: "2026-08-02", cost: 5 })], "2026-10", 3, TZ);

    expect(months.map((m) => m.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(months.map((m) => m.net)).toEqual([-5, 10, 20]);
  });

  it("wraps across a year boundary", () => {
    expect(monthlyPnl([], [], "2027-01", 2, TZ).map((m) => m.month)).toEqual(["2026-12", "2027-01"]);
  });
});

describe("periodPnl", () => {
  const periods = [
    { id: "p1", period_start: "2026-09-01T00:00:00Z", period_end: "2026-09-30T00:00:00Z" },
    { id: "open", period_start: "2026-09-30T00:00:00Z", period_end: null },
  ];

  it("assigns rows to start < date <= end and expenses by their date", () => {
    const out = periodPnl([
      tx({ id: "a", date: "2026-09-10T00:00:00Z", sale_price: 10 }),
      tx({ id: "b", date: "2026-09-30T00:00:00Z", sale_price: 20 }), // boundary → first period
      tx({ id: "c", date: "2026-10-02T00:00:00Z", sale_price: 40 }),
    ], [ex({ expense_date: "2026-09-15", cost: 3 }), ex({ expense_date: "2026-10-01", cost: 4 })], periods);

    expect(out.map((p) => [p.id, p.revenue, p.expenses])).toEqual([["p1", 30, 3], ["open", 40, 4]]);
  });
});

describe("expensesByCategory", () => {
  it("totals per category with deductible share, largest first", () => {
    const cats = expensesByCategory([
      ex({ category: "meals", cost: 40, deductible_percentage: 50 }),
      ex({ category: "booth_fee", cost: 150 }),
      ex({ category: "meals", cost: 10, deductible_percentage: 50 }),
      ex({ category: null, cost: 1, deductible_percentage: null }),
    ]);
    expect(cats).toEqual([
      { category: "booth_fee", total: 150, deductible: 150, count: 1 },
      { category: "meals", total: 50, deductible: 25, count: 2 },
      { category: "other", total: 1, deductible: 1, count: 1 },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import {
  computeDashboardTotals,
  type ExpenseRow,
  type GradingRow,
  type ItemRow,
} from "./totals";

function item(overrides: Partial<ItemRow> = {}): ItemRow {
  return {
    category: "single",
    owner: "shared",
    status: "inventory",
    cost: 0,
    market: 0,
    ...overrides,
  };
}

const noExpenses: ExpenseRow[] = [];
const noGrading: GradingRow[] = [];

describe("computeDashboardTotals — empty input", () => {
  it("returns all-zero totals for no data", () => {
    const t = computeDashboardTotals([], [], []);
    expect(t.counts).toEqual({ total: 0, inventory: 0, sold: 0 });
    expect(t.cost).toEqual({ inventory: 0, sold: 0, total_all: 0 });
    expect(t.sold).toEqual({ revenue: 0, profit: 0 });
    expect(t.pnl).toEqual({ realized: 0, unrealized: 0, total: 0 });
    expect(t.owes).toEqual({ mila_owes_alex: 0, alex_owes_mila: 0, net: 0 });
  });
});

describe("computeDashboardTotals — counts", () => {
  it("counts total, inventory and sold separately", () => {
    const t = computeDashboardTotals(
      [
        item({ status: "inventory" }),
        item({ status: "inventory" }),
        item({ status: "sold", sold_price: 10 }),
      ],
      noExpenses,
      noGrading,
    );
    expect(t.counts).toEqual({ total: 3, inventory: 2, sold: 1 });
  });
});

describe("computeDashboardTotals — cost basis", () => {
  it("splits cost by status and tracks the all-in total", () => {
    const t = computeDashboardTotals(
      [
        item({ status: "inventory", cost: 100 }),
        item({ status: "sold", cost: 40, sold_price: 60 }),
      ],
      noExpenses,
      noGrading,
    );
    expect(t.cost.inventory).toBe(100);
    expect(t.cost.sold).toBe(40);
    expect(t.cost.total_all).toBe(140);
  });

  it("treats null/NaN costs as zero rather than propagating NaN", () => {
    const t = computeDashboardTotals(
      [
        item({ cost: null, market: null }),
        item({ cost: Number.NaN, market: Number.POSITIVE_INFINITY }),
        item({ cost: 25, market: 30 }),
      ],
      noExpenses,
      noGrading,
    );
    expect(t.cost.total_all).toBe(25);
    expect(t.market.inventory).toBe(30);
  });
});

describe("computeDashboardTotals — market value", () => {
  it("only counts market value of unsold inventory", () => {
    const t = computeDashboardTotals(
      [
        item({ status: "inventory", market: 200 }),
        item({ status: "sold", market: 999, sold_price: 100 }),
      ],
      noExpenses,
      noGrading,
    );
    expect(t.market.inventory).toBe(200);
    expect(t.market.active_total).toBe(200);
  });
});

describe("computeDashboardTotals — sold revenue", () => {
  it("uses sold_price as gross revenue", () => {
    const t = computeDashboardTotals(
      [item({ status: "sold", cost: 30, sold_price: 100 })],
      noExpenses,
      noGrading,
    );
    expect(t.sold.revenue).toBe(100);
    expect(t.sold.profit).toBe(70);
  });

  it("falls back to previous_sales when sold_price is missing", () => {
    const t = computeDashboardTotals(
      [item({ status: "sold", cost: 30, sold_price: null, previous_sales: 80 })],
      noExpenses,
      noGrading,
    );
    expect(t.sold.revenue).toBe(80);
  });

  it("subtracts consigner payout so only our cut counts as revenue", () => {
    const t = computeDashboardTotals(
      [item({ status: "sold", cost: 0, sold_price: 100, consigner_payout: 70 })],
      noExpenses,
      noGrading,
    );
    expect(t.sold.revenue).toBe(30);
  });

  it("ignores revenue fields on items still in inventory", () => {
    const t = computeDashboardTotals(
      [item({ status: "inventory", sold_price: 500 })],
      noExpenses,
      noGrading,
    );
    expect(t.sold.revenue).toBe(0);
  });
});

describe("computeDashboardTotals — expenses and grading", () => {
  it("totals expenses and attributes them to who paid", () => {
    const t = computeDashboardTotals(
      [],
      [
        { paid_by: "alex", cost: 100 },
        { paid_by: "mila", cost: 40 },
        { paid_by: "shared", cost: 10 },
        { paid_by: "alex", cost: null },
      ],
      [],
    );
    expect(t.expenses.total).toBe(150);
    expect(t.expenses.by_paid_by).toEqual({ alex: 100, mila: 40, shared: 10 });
  });

  it("totals grading costs", () => {
    const t = computeDashboardTotals([], [], [{ cost: 25 }, { cost: 25 }, { cost: null }]);
    expect(t.grading.total).toBe(50);
  });
});

describe("computeDashboardTotals — P&L", () => {
  it("computes unrealized P&L as inventory market minus inventory cost", () => {
    const t = computeDashboardTotals(
      [item({ status: "inventory", cost: 100, market: 175 })],
      noExpenses,
      noGrading,
    );
    expect(t.pnl.unrealized).toBe(75);
  });

  it("deducts expenses and grading from realized P&L", () => {
    const t = computeDashboardTotals(
      [item({ status: "sold", cost: 40, sold_price: 100 })],
      [{ paid_by: "shared", cost: 15 }],
      [{ cost: 5 }],
    );
    // revenue 100 - cost 40 - expenses 15 - grading 5
    expect(t.pnl.realized).toBe(40);
  });

  it("reports total P&L as realized + unrealized", () => {
    const t = computeDashboardTotals(
      [
        item({ status: "inventory", cost: 100, market: 175 }),
        item({ status: "sold", cost: 40, sold_price: 100 }),
      ],
      [{ paid_by: "shared", cost: 15 }],
      [{ cost: 5 }],
    );
    expect(t.pnl.total).toBe(t.pnl.realized + t.pnl.unrealized);
    expect(t.pnl.total).toBe(115); // 40 realized + 75 unrealized
  });

  it("reports negative P&L when inventory is underwater", () => {
    const t = computeDashboardTotals(
      [item({ status: "inventory", cost: 200, market: 120 })],
      noExpenses,
      noGrading,
    );
    expect(t.pnl.unrealized).toBe(-80);
  });
});

describe("computeDashboardTotals — who owes who", () => {
  it("splits personally-paid expenses 50/50", () => {
    const t = computeDashboardTotals([], [{ paid_by: "alex", cost: 100 }], []);
    expect(t.owes.mila_owes_alex).toBe(50);
    expect(t.owes.alex_owes_mila).toBe(0);
    expect(t.owes.net).toBe(50); // positive → Mila owes Alex
  });

  it("nets opposing debts against each other", () => {
    const t = computeDashboardTotals(
      [],
      [
        { paid_by: "alex", cost: 100 },
        { paid_by: "mila", cost: 140 },
      ],
      [],
    );
    expect(t.owes.mila_owes_alex).toBe(50);
    expect(t.owes.alex_owes_mila).toBe(70);
    expect(t.owes.net).toBe(-20); // negative → Alex owes Mila
  });

  it("creates no debt for shared expenses", () => {
    const t = computeDashboardTotals([], [{ paid_by: "shared", cost: 500 }], []);
    expect(t.expenses.total).toBe(500);
    expect(t.owes.net).toBe(0);
  });
});

describe("computeDashboardTotals — breakdowns", () => {
  it("buckets items by owner", () => {
    const t = computeDashboardTotals(
      [
        item({ owner: "alex", cost: 10, market: 20 }),
        item({ owner: "alex", cost: 5, market: 5 }),
        item({ owner: "mila", cost: 100, market: 150 }),
      ],
      noExpenses,
      noGrading,
    );
    expect(t.breakdowns.owners.alex).toEqual({
      count: 2,
      market_active: 25,
      cost: 15,
      revenue_sold: 0,
    });
    expect(t.breakdowns.owners.mila.count).toBe(1);
    expect(t.breakdowns.owners.shared.count).toBe(0);
  });

  it("buckets items by category", () => {
    const t = computeDashboardTotals(
      [
        item({ category: "slab", cost: 200, market: 300 }),
        item({ category: "sealed", cost: 90, market: 120 }),
        item({ category: "single", cost: 1, market: 2 }),
      ],
      noExpenses,
      noGrading,
    );
    expect(t.breakdowns.categories.slab.cost).toBe(200);
    expect(t.breakdowns.categories.sealed.market_active).toBe(120);
    expect(t.breakdowns.categories.single.count).toBe(1);
  });

  it("routes sold items to revenue_sold, not market_active", () => {
    const t = computeDashboardTotals(
      [item({ owner: "alex", category: "slab", status: "sold", cost: 40, market: 999, sold_price: 100 })],
      noExpenses,
      noGrading,
    );
    expect(t.breakdowns.owners.alex.revenue_sold).toBe(100);
    expect(t.breakdowns.owners.alex.market_active).toBe(0);
    expect(t.breakdowns.categories.slab.revenue_sold).toBe(100);
  });

  it("counts an item in both its owner and category bucket", () => {
    const t = computeDashboardTotals(
      [item({ owner: "mila", category: "sealed", cost: 60, market: 75 })],
      noExpenses,
      noGrading,
    );
    expect(t.breakdowns.owners.mila.cost).toBe(60);
    expect(t.breakdowns.categories.sealed.cost).toBe(60);
  });
});

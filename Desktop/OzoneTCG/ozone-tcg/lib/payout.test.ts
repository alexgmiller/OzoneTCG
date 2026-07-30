import { describe, expect, it } from "vitest";
import {
  computePayoutTotals,
  type PayoutConsignerSaleRow,
  type PayoutExpenseRow,
  type PayoutItemCostRow,
  type PayoutSaleRow,
} from "./payout";

type Period = {
  expenses: PayoutExpenseRow[];
  items: PayoutItemCostRow[];
  sales: PayoutSaleRow[];
  consigner: PayoutConsignerSaleRow[];
};

function compute(o: Partial<Period> = {}) {
  const { expenses = [], items = [], sales = [], consigner = [] } = o;
  return computePayoutTotals(expenses, items, sales, consigner);
}

describe("computePayoutTotals — empty period", () => {
  it("settles to zero when nothing happened", () => {
    expect(compute()).toEqual({
      alexPaid: 0,
      milaPaid: 0,
      sharedSales: 0,
      netPayout: 0,
    });
  });
});

describe("computePayoutTotals — out-of-pocket spend", () => {
  it("sums each partner's expenses", () => {
    const t = compute({
      expenses: [
        { paid_by: "alex", cost: 100 },
        { paid_by: "alex", cost: 50 },
        { paid_by: "mila", cost: 40 },
      ],
    });
    expect(t.alexPaid).toBe(150);
    expect(t.milaPaid).toBe(40);
  });

  it("counts unsold inventory cost as out-of-pocket spend", () => {
    const t = compute({
      items: [
        { owner: "alex", cost: 200 },
        { owner: "mila", cost: 75 },
      ],
    });
    expect(t.alexPaid).toBe(200);
    expect(t.milaPaid).toBe(75);
  });

  it("combines expenses and inventory cost for the same partner", () => {
    const t = compute({
      expenses: [{ paid_by: "alex", cost: 100 }],
      items: [{ owner: "alex", cost: 200 }],
    });
    expect(t.alexPaid).toBe(300);
  });

  it("ignores rows belonging to neither partner", () => {
    const t = compute({
      expenses: [{ paid_by: "shared", cost: 500 }],
      items: [{ owner: "consigner", cost: 900 }],
    });
    expect(t.alexPaid).toBe(0);
    expect(t.milaPaid).toBe(0);
  });

  it("treats null costs as zero", () => {
    const t = compute({
      expenses: [{ paid_by: "alex", cost: null }],
      items: [{ owner: "alex", cost: null }],
    });
    expect(t.alexPaid).toBe(0);
  });
});

describe("computePayoutTotals — shared sales", () => {
  it("sums shared-owner sale prices", () => {
    const t = compute({ sales: [{ sold_price: 100 }, { sold_price: 250 }] });
    expect(t.sharedSales).toBe(350);
  });

  it("counts only our spread on consigner sales, not the gross", () => {
    const t = compute({ consigner: [{ sold_price: 100, consigner_payout: 70 }] });
    expect(t.sharedSales).toBe(30);
  });

  it("adds consigner spread to shared sales", () => {
    const t = compute({
      sales: [{ sold_price: 200 }],
      consigner: [{ sold_price: 100, consigner_payout: 70 }],
    });
    expect(t.sharedSales).toBe(230);
  });

  it("treats a missing consigner payout as keeping the full sale", () => {
    const t = compute({ consigner: [{ sold_price: 100, consigner_payout: null }] });
    expect(t.sharedSales).toBe(100);
  });
});

describe("computePayoutTotals — settlement direction", () => {
  it("has Alex pay Mila when Mila fronted more", () => {
    const t = compute({ expenses: [{ paid_by: "mila", cost: 100 }] });
    // 0.5 × 100 owed back to Mila
    expect(t.netPayout).toBe(50);
    expect(t.netPayout).toBeGreaterThan(0);
  });

  it("has Mila pay Alex when Alex fronted more", () => {
    const t = compute({ expenses: [{ paid_by: "alex", cost: 100 }] });
    expect(t.netPayout).toBe(-50);
    expect(t.netPayout).toBeLessThan(0);
  });

  it("settles to zero when both fronted the same amount", () => {
    const t = compute({
      expenses: [
        { paid_by: "alex", cost: 120 },
        { paid_by: "mila", cost: 120 },
      ],
    });
    expect(t.netPayout).toBe(0);
  });

  it("splits shared sales revenue in half toward Mila", () => {
    // Alex holds the proceeds, so Mila's half is paid out to her.
    const t = compute({ sales: [{ sold_price: 400 }] });
    expect(t.netPayout).toBe(200);
  });

  it("nets sales revenue against out-of-pocket spend", () => {
    const t = compute({
      sales: [{ sold_price: 400 }],
      expenses: [{ paid_by: "alex", cost: 100 }],
    });
    // 0.5×400 + 0.5×0 − 0.5×100
    expect(t.netPayout).toBe(150);
  });

  it("handles a full period end to end", () => {
    const t = compute({
      expenses: [
        { paid_by: "alex", cost: 120 },
        { paid_by: "mila", cost: 60 },
        { paid_by: "shared", cost: 999 },
      ],
      items: [
        { owner: "alex", cost: 80 },
        { owner: "mila", cost: 40 },
      ],
      sales: [{ sold_price: 500 }],
      consigner: [{ sold_price: 300, consigner_payout: 200 }],
    });
    expect(t.alexPaid).toBe(200); // 120 + 80
    expect(t.milaPaid).toBe(100); // 60 + 40
    expect(t.sharedSales).toBe(600); // 500 + (300 − 200)
    // 0.5×600 + 0.5×100 − 0.5×200
    expect(t.netPayout).toBe(250);
  });
});

import { describe, expect, it } from "vitest";
import { historyChange, historyPoints, historyRows } from "./priceHistory";

describe("historyRows", () => {
  it("records held items with a real price, rounded to cents", () => {
    const rows = historyRows([
      { id: "a", workspace_id: "w", market: 814.254, status: "inventory" },
      { id: "b", workspace_id: "w", market: 12, status: "grading" },
      { id: "c", workspace_id: "w", market: 50, status: "sold" },
      { id: "d", workspace_id: "w", market: null, status: "inventory" },
      { id: "e", workspace_id: "w", market: 0, status: "inventory" },
    ], "2026-11-17");
    expect(rows).toEqual([
      { item_id: "a", workspace_id: "w", date: "2026-11-17", market: 814.25 },
      { item_id: "b", workspace_id: "w", date: "2026-11-17", market: 12 },
    ]);
  });
});

describe("historyPoints / historyChange", () => {
  it("orders points oldest first and reads numeric strings", () => {
    expect(historyPoints([{ date: "2026-11-17", market: "820.10" }, { date: "2026-11-15", market: 800 }])).toEqual([
      { date: "2026-11-15", value: 800 },
      { date: "2026-11-17", value: 820.1 },
    ]);
  });
  it("measures first to last, and needs two points", () => {
    expect(historyChange([{ date: "a", value: 800 }, { date: "b", value: 760 }])).toEqual({ amount: -40, pct: -5 });
    expect(historyChange([{ date: "a", value: 800 }])).toBeNull();
  });
});

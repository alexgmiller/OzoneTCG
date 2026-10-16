import { describe, it, expect } from "vitest";
import {
  filterItems, sortItems, summarize, priceDelta, daysInStock, sortLabel, countActiveFilters, defaultFilters,
} from "./inventoryView";
import type { Item } from "./types";

const NOW = new Date("2026-10-16T12:00:00Z");

const item = (over: Partial<Item>): Item => ({
  id: "x", name: "Charizard", category: "single", owner: "shared", status: "inventory",
  market: 100, cost: 60, condition: "Near Mint", notes: null, created_at: "2026-10-01T00:00:00Z",
  consigner_id: null, image_url: null, set_name: "Base Set", card_number: "4", grade: null,
  cost_basis: null, buy_percentage: null, acquisition_type: null, chain_depth: 0,
  original_cash_invested: null, sticker_price: null, acquired_market_price: null, acquired_date: null,
  product_type: null, quantity: 1, language: "english",
  ...over,
});

describe("filterItems", () => {
  const items = [
    item({ id: "a" }),
    item({ id: "b", category: "slab", grade: "PSA 10" }),
    item({ id: "c", owner: "consigner", consigner_id: "c1" }),
    item({ id: "d", status: "sold", sold_at: "2026-10-10T00:00:00Z" }),
    item({ id: "e", name: "Pikachu", set_name: "Jungle" }),
  ];
  const ids = (f: Partial<typeof defaultFilters>) => filterItems(items, { ...defaultFilters, ...f }).map((i) => i.id);

  it("defaults to in-stock rows only", () => expect(ids({})).toEqual(["a", "b", "c", "e"]));
  it("sold shows the sold pool", () => expect(ids({ status: "sold" })).toEqual(["d"]));
  it("matches search on name or set", () => {
    expect(ids({ search: "pika" })).toEqual(["e"]);
    expect(ids({ search: "jungle" })).toEqual(["e"]);
  });
  it("filters by category", () => expect(ids({ category: "slab" })).toEqual(["b"]));
  it("consigner: none / any / specific", () => {
    expect(ids({ consigner: "none" })).toEqual(["a", "b", "e"]);
    expect(ids({ consigner: "any" })).toEqual(["c"]);
    expect(ids({ consigner: "c1" })).toEqual(["c"]);
    expect(ids({ consigner: "other" })).toEqual([]);
  });
});

describe("sortItems", () => {
  const price = (it: Item) => it.market;
  const items = [
    item({ id: "a", name: "B", market: 50, cost: 10, sticker_price: 20, created_at: "2026-10-10T00:00:00Z" }),
    item({ id: "b", name: "A", market: null, cost: 30, sticker_price: null, created_at: "2026-09-01T00:00:00Z" }),
    item({ id: "c", name: "C", market: 200, cost: null, sticker_price: 90, created_at: "2026-10-15T00:00:00Z" }),
  ];
  const order = (k: Parameters<typeof sortItems>[1]) => sortItems(items, k, price, false, NOW).map((i) => i.id);

  it("by value with nulls last", () => {
    expect(order("market-desc")).toEqual(["c", "a", "b"]);
    expect(order("market-asc")).toEqual(["a", "c", "b"]);
  });
  it("by cost, sticker, name, date, days", () => {
    expect(order("cost-desc")).toEqual(["b", "a", "c"]);
    expect(order("sticker-desc")).toEqual(["c", "a", "b"]);
    expect(order("name-asc")).toEqual(["b", "a", "c"]);
    expect(order("date-desc")).toEqual(["c", "a", "b"]);
    expect(order("days-desc")).toEqual(["b", "a", "c"]);
  });
  it("does not mutate the input", () => {
    const copy = [...items];
    sortItems(items, "name-asc", price, false, NOW);
    expect(items).toEqual(copy);
  });
});

describe("summarize", () => {
  it("totals value, and profit only over costed items", () => {
    const s = summarize([
      item({ market: 100, cost: 60 }),
      item({ market: 50, cost: null, cost_basis: null }),
      item({ category: "sealed", market: 10, cost: 8, quantity: 3 }),
    ], (it) => it.market);
    expect(s.total).toBe(180);
    expect(s.costedCount).toBe(2);
    expect(s.totalCost).toBe(68);
    expect(s.profit).toBe(130 - 68);
  });
  it("prefers cost_basis over cost", () => {
    const s = summarize([item({ market: 100, cost: 60, cost_basis: 70 })], (it) => it.market);
    expect(s.totalCost).toBe(70);
  });
});

describe("helpers", () => {
  it("priceDelta", () => {
    expect(priceDelta(10, 5)).toBe("up");
    expect(priceDelta(3, 5)).toBe("down");
    expect(priceDelta(5, 5)).toBeNull();
    expect(priceDelta(null, 5)).toBeNull();
  });
  it("daysInStock prefers acquired_date", () => {
    expect(daysInStock(item({ created_at: "2026-10-01T00:00:00Z", acquired_date: null }), NOW)).toBe(15);
    expect(daysInStock(item({ created_at: "2026-10-01T00:00:00Z", acquired_date: "2026-10-14" }), NOW)).toBe(2);
  });
  it("sortLabel and countActiveFilters", () => {
    expect(sortLabel("date-desc")).toBe("Date ↓");
    expect(sortLabel("market-asc")).toBe("Value ↑");
    expect(countActiveFilters(defaultFilters)).toBe(0);
    expect(countActiveFilters({ ...defaultFilters, search: "x", category: "slab" })).toBe(2);
  });
});

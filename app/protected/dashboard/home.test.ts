import { describe, it, expect } from "vitest";
import {
  rangeStartDay, filterByRange, realizedProfitByDay, cumulative, sum,
  inStockCounts, topValuable, tileDelta, tileMeta, type StockItem,
} from "./home";

const NOW = new Date("2026-10-16T12:00:00Z");

describe("rangeStartDay", () => {
  it("counts back the right number of days", () => {
    expect(rangeStartDay("1W", NOW)).toBe("2026-10-09");
    expect(rangeStartDay("1M", NOW)).toBe("2026-09-16");
    expect(rangeStartDay("1Y", NOW)).toBe("2025-10-16");
  });
  it("has no bound for All", () => {
    expect(rangeStartDay("All", NOW)).toBeNull();
  });
});

describe("filterByRange", () => {
  const pts = [{ date: "2026-10-01" }, { date: "2026-10-10" }, { date: "2026-10-16" }];
  it("keeps points on or after the start day", () => {
    expect(filterByRange(pts, "1W", NOW).map((p) => p.date)).toEqual(["2026-10-10", "2026-10-16"]);
  });
  it("returns everything for All", () => {
    expect(filterByRange(pts, "All", NOW)).toHaveLength(3);
  });
});

describe("realizedProfitByDay", () => {
  it("sums sale minus cost basis per day, sorted ascending", () => {
    const pts = realizedProfitByDay([
      { date: "2026-10-02T15:00:00Z", sale_price: 100, cost_basis: 60 },
      { date: "2026-10-01T09:00:00Z", sale_price: 50, cost_basis: 20 },
      { date: "2026-10-02T18:00:00Z", sale_price: 30, cost_basis: 40 },
    ]);
    expect(pts).toEqual([
      { date: "2026-10-01", profit: 30 },
      { date: "2026-10-02", profit: 30 },
    ]);
  });
  it("treats null prices as zero", () => {
    expect(realizedProfitByDay([{ date: "2026-10-01", sale_price: null, cost_basis: 10 }])).toEqual([
      { date: "2026-10-01", profit: -10 },
    ]);
  });
  it("cumulates and sums", () => {
    const pts = [{ date: "a", profit: 10 }, { date: "b", profit: -4 }, { date: "c", profit: 6 }];
    expect(cumulative(pts).map((p) => p.value)).toEqual([10, 6, 12]);
    expect(sum(pts)).toBe(12);
  });
});

const item = (over: Partial<StockItem>): StockItem => ({
  id: "x", name: "Card", category: "single", status: "inventory", market: 10, cost: 5,
  set_name: null, card_number: null, grade: null, condition: "Near Mint", image_url: null, consigner_id: null,
  ...over,
});

describe("inStockCounts", () => {
  it("counts only in-stock items per category", () => {
    const c = inStockCounts([
      item({ category: "single" }), item({ category: "slab" }), item({ category: "slab" }),
      item({ category: "sealed", status: "sold" }),
    ]);
    expect(c).toEqual({ single: 1, slab: 2, sealed: 0 });
  });
});

describe("topValuable", () => {
  it("returns in-stock items by market desc, capped", () => {
    const top = topValuable([
      item({ id: "a", market: 50 }), item({ id: "b", market: 500 }),
      item({ id: "c", market: 900, status: "sold" }), item({ id: "d", market: null }),
    ], 5);
    expect(top.map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("tile helpers", () => {
  it("derives the delta arrow from market vs cost", () => {
    expect(tileDelta(item({ market: 10, cost: 5 }))).toBe("up");
    expect(tileDelta(item({ market: 3, cost: 5 }))).toBe("down");
    expect(tileDelta(item({ market: 5, cost: 5 }))).toBeNull();
    expect(tileDelta(item({ market: 5, cost: null }))).toBeNull();
  });
  it("shows grade for slabs and condition for singles", () => {
    expect(tileMeta(item({ category: "slab", grade: "10" }))).toBe("PSA 10");
    expect(tileMeta(item({ category: "slab", grade: "BGS 9.5" }))).toBe("BGS 9.5");
    expect(tileMeta(item({ category: "single", condition: "Lightly Played" }))).toBe("Lightly Played");
    expect(tileMeta(item({ category: "sealed" }))).toBeNull();
  });
});

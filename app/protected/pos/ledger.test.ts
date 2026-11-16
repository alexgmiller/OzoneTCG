import { describe, it, expect } from "vitest";
import { allocateBundle, round2 } from "./ledger";

const sum = (m: Record<string, number>) => round2(Object.values(m).reduce((s, v) => s + v, 0));

describe("allocateBundle", () => {
  const lines = [{ id: "a", market: 100 }, { id: "b", market: 50 }, { id: "c", market: 50 }];

  it("splits in proportion to FMV and sums to the total exactly", () => {
    const m = allocateBundle(180, lines);
    expect(m).toEqual({ a: 90, b: 45, c: 45 });
    expect(sum(m)).toBe(180);
  });

  it("sends rounding remainder to the highest-FMV item", () => {
    // 100 across three equal weights: 33.33 ×3 = 99.99, drift 0.01 → first (highest tie) gets it
    const m = allocateBundle(100, [{ id: "x", market: 10 }, { id: "y", market: 10 }, { id: "z", market: 10 }]);
    expect(sum(m)).toBe(100);
    expect(m.x).toBe(33.34);
    expect(m.y).toBe(33.33);
    expect(m.z).toBe(33.33);
  });

  it("remainder goes to the highest market, not the last line", () => {
    const m = allocateBundle(100, [{ id: "low", market: 1 }, { id: "high", market: 2 }, { id: "mid", market: 1.5 }]);
    expect(sum(m)).toBe(100);
    // 22.22 / 44.44 / 33.33 = 99.99 → high gets the cent
    expect(m.high).toBe(44.45);
  });

  it("holds an override fixed and re-balances the rest", () => {
    const m = allocateBundle(180, lines, { a: 100 });
    expect(m.a).toBe(100);
    expect(m.b).toBe(40);
    expect(m.c).toBe(40);
    expect(sum(m)).toBe(180);
  });

  it("every line overridden: returns the overrides, ignoring total", () => {
    const m = allocateBundle(999, lines, { a: 1, b: 2, c: 3 });
    expect(m).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("splits evenly when no item has a market", () => {
    const m = allocateBundle(90, [{ id: "a", market: null }, { id: "b", market: 0 }, { id: "c", market: null }]);
    expect(m).toEqual({ a: 30, b: 30, c: 30 });
  });

  it("negative overrides clamp to zero", () => {
    const m = allocateBundle(100, lines, { a: -5 });
    expect(m.a).toBe(0);
    expect(sum(m)).toBe(100);
  });

  it("empty input", () => expect(allocateBundle(100, [])).toEqual({}));
});

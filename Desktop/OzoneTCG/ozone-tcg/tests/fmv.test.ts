import { describe, it, expect } from "vitest";
import { computeBlendedFMV, iqrFilter, pctile } from "../lib/fmv";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

describe("pctile", () => {
  it("returns the single element for length-1 arrays", () => {
    expect(pctile([42], 0.5)).toBe(42);
  });

  it("interpolates the median of an even-length array", () => {
    expect(pctile([10, 20, 30, 40], 0.5)).toBe(25);
  });

  it("computes Q1 with linear interpolation", () => {
    expect(pctile([10, 20, 30, 40], 0.25)).toBe(17.5);
  });

  it("returns min at p=0 and max at p=1", () => {
    expect(pctile([5, 9, 100], 0)).toBe(5);
    expect(pctile([5, 9, 100], 1)).toBe(100);
  });
});

describe("iqrFilter", () => {
  it("returns sorted input untouched when fewer than 4 items", () => {
    expect(iqrFilter([30, 10, 20])).toEqual([10, 20, 30]);
  });

  it("removes a high outlier", () => {
    const result = iqrFilter([100, 102, 98, 101, 99, 5000]);
    expect(result).not.toContain(5000);
    expect(result).toHaveLength(5);
  });

  it("removes a low outlier", () => {
    const result = iqrFilter([100, 102, 98, 101, 99, 1]);
    expect(result).not.toContain(1);
  });

  it("keeps a tight cluster intact", () => {
    expect(iqrFilter([100, 101, 99, 100])).toEqual([99, 100, 100, 101]);
  });
});

describe("computeBlendedFMV", () => {
  const sold = (price: number, days: number) => ({ price, soldDate: daysAgo(days) });

  it("blends 50/50 when the most recent sale is within 7 days", () => {
    const result = computeBlendedFMV(
      [sold(100, 1), sold(100, 2), sold(100, 3), sold(100, 4)],
      [{ price: 80 }, { price: 80 }, { price: 80 }, { price: 80 }],
    );
    expect(result.mode).toBe("blended");
    expect(result.soldAnchor).toBe(100);
    expect(result.listedAnchor).toBe(80);
    expect(result.fmv).toBe(90); // 100*0.5 + 80*0.5
  });

  it("shifts to 40/60 when the most recent sale is 7-30 days old", () => {
    const result = computeBlendedFMV(
      [sold(100, 10), sold(100, 12), sold(100, 20), sold(100, 25)],
      [{ price: 80 }, { price: 80 }, { price: 80 }, { price: 80 }],
    );
    expect(result.fmv).toBe(88); // 100*0.4 + 80*0.6
  });

  it("shifts to 25/75 when the most recent sale is 30+ days old", () => {
    const result = computeBlendedFMV(
      [sold(100, 45), sold(100, 50), sold(100, 60), sold(100, 80)],
      [{ price: 80 }, { price: 80 }, { price: 80 }, { price: 80 }],
    );
    expect(result.fmv).toBe(85); // 100*0.25 + 80*0.75
  });

  it("degrades to active_only when there are no sold items", () => {
    const result = computeBlendedFMV([], [{ price: 80 }, { price: 90 }, { price: 100 }, { price: 110 }]);
    expect(result.mode).toBe("active_only");
    expect(result.fmv).toBe(result.listedAnchor);
  });

  it("degrades to sold_only when there are no active listings", () => {
    const result = computeBlendedFMV([sold(100, 1), sold(110, 2)], []);
    expect(result.mode).toBe("sold_only");
    expect(result.fmv).toBe(result.soldAnchor);
  });

  it("returns none mode with null fmv when there is no data", () => {
    const result = computeBlendedFMV([], []);
    expect(result.mode).toBe("none");
    expect(result.fmv).toBeNull();
  });

  it("filters out junk prices at or below $1", () => {
    const result = computeBlendedFMV(
      [sold(1, 1), sold(0.5, 2)],
      [{ price: 0.99 }, { price: 1 }],
    );
    expect(result.mode).toBe("none");
  });

  it("handles null/undefined inputs gracefully", () => {
    const result = computeBlendedFMV(null, undefined);
    expect(result.mode).toBe("none");
    expect(result.fmv).toBeNull();
  });
});

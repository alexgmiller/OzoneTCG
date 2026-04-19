import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeBlendedFMV } from "./fmv";

const DAY = 86_400_000;

// Pin "now" so day-based weight cutoffs are deterministic.
const NOW = new Date("2025-06-15T12:00:00Z").getTime();

function daysAgo(n: number): string {
  return new Date(NOW - n * DAY).toISOString();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  // Silence the informational console.log lines from fmv.ts in test output.
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("computeBlendedFMV — degenerate inputs", () => {
  it("returns mode=none when both inputs are empty/null", () => {
    expect(computeBlendedFMV(null, null)).toEqual({
      fmv: null,
      mode: "none",
      soldAnchor: null,
      listedAnchor: null,
      soldCount: 0,
      activeCount: 0,
    });
    expect(computeBlendedFMV([], [])).toMatchObject({ fmv: null, mode: "none" });
  });

  it("filters out prices ≤ $1 (treated as noise)", () => {
    const result = computeBlendedFMV(
      [
        { price: 0.5, soldDate: daysAgo(1) },
        { price: 1, soldDate: daysAgo(1) },
        { price: 100, soldDate: daysAgo(1) },
      ],
      null,
    );
    expect(result.mode).toBe("sold_only");
    expect(result.soldCount).toBe(1);
    expect(result.fmv).toBe(100);
  });
});

describe("computeBlendedFMV — sold_only mode", () => {
  it("uses the median of sold prices as FMV", () => {
    const result = computeBlendedFMV(
      [
        { price: 10, soldDate: daysAgo(1) },
        { price: 20, soldDate: daysAgo(1) },
        { price: 30, soldDate: daysAgo(1) },
      ],
      null,
    );
    expect(result.mode).toBe("sold_only");
    expect(result.soldAnchor).toBe(20);
    expect(result.fmv).toBe(20);
    expect(result.soldCount).toBe(3);
    expect(result.activeCount).toBe(0);
  });

  it("rounds non-integer medians", () => {
    const result = computeBlendedFMV(
      [
        { price: 10, soldDate: daysAgo(1) },
        { price: 11, soldDate: daysAgo(1) },
      ],
      null,
    );
    expect(result.fmv).toBe(11); // round(10.5) → 11 in IEEE round-half-to-even? Math.round(10.5) === 11
  });
});

describe("computeBlendedFMV — active_only mode", () => {
  it("uses Q1 of active prices as FMV", () => {
    const result = computeBlendedFMV(null, [
      { price: 10 },
      { price: 20 },
      { price: 30 },
      { price: 40 },
    ]);
    expect(result.mode).toBe("active_only");
    // Q1 over [10,20,30,40] with linear interp = 10 + 0.75*(20-10) = 17.5 → 18
    expect(result.listedAnchor).toBe(18);
    expect(result.fmv).toBe(18);
    expect(result.activeCount).toBe(4);
  });
});

describe("computeBlendedFMV — blended weights by recency", () => {
  // Anchors chosen so weighted math is obvious:
  // sold anchor = median(100,100,100) = 100
  // listed anchor = Q1(200,200,200) = 200
  const soldAt = (d: number) => [
    { price: 100, soldDate: daysAgo(d) },
    { price: 100, soldDate: daysAgo(d) },
    { price: 100, soldDate: daysAgo(d) },
  ];
  const active = [{ price: 200 }, { price: 200 }, { price: 200 }];

  it("weights 50/50 when most recent sale is ≤7 days ago", () => {
    const result = computeBlendedFMV(soldAt(3), active);
    expect(result.mode).toBe("blended");
    expect(result.soldAnchor).toBe(100);
    expect(result.listedAnchor).toBe(200);
    // 0.5*100 + 0.5*200 = 150
    expect(result.fmv).toBe(150);
  });

  it("weights 40/60 when most recent sale is 7–30 days ago", () => {
    const result = computeBlendedFMV(soldAt(14), active);
    // 0.4*100 + 0.6*200 = 160
    expect(result.fmv).toBe(160);
  });

  it("weights 25/75 when most recent sale is >30 days ago", () => {
    const result = computeBlendedFMV(soldAt(60), active);
    // 0.25*100 + 0.75*200 = 175
    expect(result.fmv).toBe(175);
  });

  it("uses the most recent sale date for weighting, not the oldest", () => {
    const result = computeBlendedFMV(
      [
        { price: 100, soldDate: daysAgo(90) }, // old
        { price: 100, soldDate: daysAgo(2) },  // fresh
        { price: 100, soldDate: daysAgo(60) }, // old
      ],
      active,
    );
    // max date → 2 days ago → 50/50 weighting
    expect(result.fmv).toBe(150);
  });

  it("falls back to 50/50 weighting when all sold dates are invalid", () => {
    const result = computeBlendedFMV(
      [
        { price: 100, soldDate: "not-a-date" },
        { price: 100, soldDate: "also-bad" },
        { price: 100, soldDate: "" },
      ],
      active,
    );
    expect(result.mode).toBe("blended");
    expect(result.fmv).toBe(150); // default weights
  });
});

describe("computeBlendedFMV — IQR outlier filtering", () => {
  it("drops extreme outliers from the sold anchor (needs ≥4 points to filter)", () => {
    // Without filter: median(10,10,10,10,10000) = 10
    // With filter: q1=10, q3=10, iqr=0 → bounds=[10,10] → only 10s kept → median 10.
    // Core intent: the 10000 outlier must not drag the anchor up.
    const result = computeBlendedFMV(
      [
        { price: 10, soldDate: daysAgo(1) },
        { price: 10, soldDate: daysAgo(1) },
        { price: 10, soldDate: daysAgo(1) },
        { price: 10, soldDate: daysAgo(1) },
        { price: 10000, soldDate: daysAgo(1) },
      ],
      null,
    );
    expect(result.mode).toBe("sold_only");
    expect(result.soldAnchor).toBe(10);
    expect(result.soldCount).toBe(4);
  });

  it("does not filter when fewer than 4 data points", () => {
    const result = computeBlendedFMV(
      [
        { price: 10, soldDate: daysAgo(1) },
        { price: 10, soldDate: daysAgo(1) },
        { price: 10000, soldDate: daysAgo(1) },
      ],
      null,
    );
    expect(result.soldCount).toBe(3);
    // median of [10,10,10000] is 10
    expect(result.soldAnchor).toBe(10);
  });

  it("falls back to unfiltered set if the IQR filter would remove everything", () => {
    // All identical prices: q1=q3=iqr=0, bounds collapse, but filter returns the
    // unfiltered set when the result would be empty — ensures at least one point.
    const result = computeBlendedFMV(
      [
        { price: 50, soldDate: daysAgo(1) },
        { price: 50, soldDate: daysAgo(1) },
        { price: 50, soldDate: daysAgo(1) },
        { price: 50, soldDate: daysAgo(1) },
      ],
      null,
    );
    expect(result.soldAnchor).toBe(50);
    expect(result.soldCount).toBe(4);
  });
});

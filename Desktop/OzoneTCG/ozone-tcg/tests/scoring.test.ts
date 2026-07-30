import { describe, it, expect } from "vitest";
import {
  computeMomentum,
  computeScarcity,
  computeBuyPassScore,
  FACTOR_WEIGHTS,
  type SoldComp,
  type PopSnapshot,
} from "../lib/scoring";
import type { FMVResult } from "../lib/fmv";

// Fixed clock so window math is deterministic
const NOW = new Date("2026-07-01T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const comp = (price: number, days: number): SoldComp => ({ price, soldDate: daysAgo(days) });
const snap = (population: number, days: number): PopSnapshot => ({
  population,
  snapshotDate: daysAgo(days),
});

const fmvOf = (fmv: number | null, soldAnchor: number | null = fmv, listedAnchor: number | null = fmv): FMVResult => ({
  fmv,
  mode: fmv != null ? "blended" : "none",
  soldAnchor,
  listedAnchor,
  soldCount: soldAnchor != null ? 5 : 0,
  activeCount: listedAnchor != null ? 5 : 0,
});

describe("computeMomentum", () => {
  it("is insufficient with too few sales in the 30d window", () => {
    const result = computeMomentum([comp(100, 5), comp(100, 50), comp(100, 60)], NOW);
    expect(result.dataStatus).toBe("insufficient");
    expect(result.deltaPct).toBeNull();
  });

  it("detects a rising market as a positive delta", () => {
    const comps = [
      // five older sales at $100 (days 40-80)
      comp(100, 40), comp(100, 50), comp(100, 60), comp(100, 70), comp(100, 80),
      // three recent sales at $120
      comp(120, 5), comp(120, 10), comp(120, 15),
    ];
    const result = computeMomentum(comps, NOW);
    expect(result.dataStatus).toBe("ok");
    expect(result.median30d).toBe(120);
    expect(result.median90d).toBe(100);
    expect(result.deltaPct).toBeCloseTo(20, 5);
  });

  it("reports ~zero delta for a flat market", () => {
    const comps = [
      comp(100, 5), comp(100, 12), comp(100, 20),
      comp(100, 45), comp(100, 60), comp(100, 75),
    ];
    const result = computeMomentum(comps, NOW);
    expect(result.dataStatus).toBe("ok");
    expect(result.deltaPct).toBeCloseTo(0, 5);
  });

  it("ignores sales outside the 90d window", () => {
    const comps = [
      comp(100, 5), comp(100, 10), comp(100, 15),
      comp(100, 40), comp(100, 60),
      comp(9999, 120), // far outside the window — must not affect medians
    ];
    const result = computeMomentum(comps, NOW);
    expect(result.median90d).toBe(100);
  });
});

describe("computeScarcity", () => {
  it("is neutral with fewer than 2 snapshots", () => {
    const result = computeScarcity([snap(150, 10)], NOW);
    expect(result.dataStatus).toBe("insufficient");
    expect(result.multiplier).toBe(1);
    expect(result.latestPopulation).toBe(150);
  });

  it("is neutral when snapshots span fewer than 14 days", () => {
    const result = computeScarcity([snap(100, 5), snap(101, 1)], NOW);
    expect(result.dataStatus).toBe("insufficient");
    expect(result.multiplier).toBe(1);
  });

  it("is ~1.0 at the neutral growth rate (10%/yr)", () => {
    const result = computeScarcity([snap(100, 365), snap(110, 0)], NOW);
    expect(result.dataStatus).toBe("ok");
    expect(result.annualizedPopGrowth).toBeCloseTo(0.1, 3);
    expect(result.multiplier).toBeCloseTo(1.0, 3);
  });

  it("awards a scarcity bonus for a frozen population", () => {
    const result = computeScarcity([snap(100, 365), snap(100, 0)], NOW);
    expect(result.annualizedPopGrowth).toBeCloseTo(0, 5);
    expect(result.multiplier).toBeCloseTo(1.05, 3);
  });

  it("clamps the penalty for fast-inflating supply at the floor", () => {
    const result = computeScarcity([snap(100, 365), snap(200, 0)], NOW);
    expect(result.annualizedPopGrowth).toBeCloseTo(1.0, 3);
    expect(result.multiplier).toBe(0.85);
  });

  it("is neutral when the earliest population is zero", () => {
    const result = computeScarcity([snap(0, 100), snap(50, 0)], NOW);
    expect(result.dataStatus).toBe("insufficient");
    expect(result.multiplier).toBe(1);
  });
});

describe("computeBuyPassScore", () => {
  it("returns insufficient_data when FMV is unavailable", () => {
    const result = computeBuyPassScore({
      askPrice: 50,
      fmv: fmvOf(null, null, null),
      soldComps: [],
      popSnapshots: [],
      now: NOW,
    });
    expect(result.verdict).toBe("insufficient_data");
    expect(result.finalScore).toBeNull();
    expect(result.baseScore).toBeNull();
  });

  it("scores a strong deal with healthy liquidity as a buy", () => {
    const comps = [
      comp(100, 2), comp(102, 5), comp(98, 9), comp(101, 14), comp(99, 20),
      comp(100, 35), comp(100, 50), comp(97, 65), comp(103, 80),
    ];
    const result = computeBuyPassScore({
      askPrice: 80, // 20% below FMV → deal subscore 100
      fmv: fmvOf(100),
      soldComps: comps,
      popSnapshots: [snap(500, 365), snap(500, 0)], // frozen pop → 1.05x
      now: NOW,
    });
    expect(result.verdict === "buy" || result.verdict === "strong_buy").toBe(true);
    const deal = result.factors.find((f) => f.key === "deal")!;
    expect(deal.score).toBe(100);
    expect(deal.dataStatus).toBe("ok");
  });

  it("excludes momentum and renormalizes weights when comps are thin", () => {
    const result = computeBuyPassScore({
      askPrice: 100,
      fmv: fmvOf(100),
      soldComps: [comp(100, 5)], // 1 sale: liquidity ok (low), momentum insufficient
      popSnapshots: [],
      now: NOW,
    });
    const momentum = result.factors.find((f) => f.key === "momentum")!;
    expect(momentum.dataStatus).toBe("insufficient");
    expect(momentum.effectiveWeight).toBe(0);

    const usable = result.factors.filter((f) => f.dataStatus === "ok");
    const totalEffective = usable.reduce((s, f) => s + f.effectiveWeight, 0);
    expect(totalEffective).toBeCloseTo(1, 10);

    // weightedPoints must sum to the base score
    const sum = usable.reduce((s, f) => s + f.weightedPoints, 0);
    expect(sum).toBeCloseTo(result.baseScore!, 1);
  });

  it("treats zero sales as bad liquidity, not missing data", () => {
    const result = computeBuyPassScore({
      askPrice: 100,
      fmv: fmvOf(100),
      soldComps: [],
      popSnapshots: [],
      now: NOW,
    });
    const liquidity = result.factors.find((f) => f.key === "liquidity")!;
    expect(liquidity.dataStatus).toBe("ok");
    expect(liquidity.score).toBe(0);
  });

  it("gives an at-FMV price a neutral deal subscore of 50", () => {
    const result = computeBuyPassScore({
      askPrice: 100,
      fmv: fmvOf(100),
      soldComps: [],
      popSnapshots: [],
      now: NOW,
    });
    expect(result.factors.find((f) => f.key === "deal")!.score).toBe(50);
  });

  it("scores an overpriced illiquid card as a pass", () => {
    const result = computeBuyPassScore({
      askPrice: 130, // 30% above FMV → deal 0
      fmv: fmvOf(100),
      soldComps: [],
      popSnapshots: [],
      now: NOW,
    });
    expect(result.verdict).toBe("pass");
  });

  it("keeps the final score within 0-100 after the scarcity multiplier", () => {
    const comps = Array.from({ length: 25 }, (_, i) => comp(100, (i * 3) % 89));
    const result = computeBuyPassScore({
      askPrice: 50, // extreme deal
      fmv: fmvOf(100),
      soldComps: comps,
      popSnapshots: [snap(100, 365), snap(100, 0)], // 1.05x bonus
      now: NOW,
    });
    expect(result.finalScore).toBeLessThanOrEqual(100);
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
  });

  it("configured factor weights sum to 1", () => {
    const total = Object.values(FACTOR_WEIGHTS).reduce((s, w) => s + w, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

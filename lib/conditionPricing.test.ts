import { describe, expect, it } from "vitest";
import { adjustForCondition, DEFAULT_FACTORS, learnFactors, MIN_SAMPLES, playedCondition, type ConditionPriceRow } from "./conditionPricing";

const row = (nm: number, lp: number | null, mp: number | null = null, hp: number | null = null, dmg: number | null = null): ConditionPriceRow =>
  ({ nm_price: nm, lp_price: lp, mp_price: mp, hp_price: hp, dmg_price: dmg });

describe("playedCondition", () => {
  it("maps played labels and leaves near mint and blanks alone", () => {
    expect(playedCondition("Lightly Played")).toBe("lp");
    expect(playedCondition("moderately played ")).toBe("mp");
    expect(playedCondition("Heavily Played")).toBe("hp");
    expect(playedCondition("Damaged")).toBe("dmg");
    expect(playedCondition("Near Mint")).toBeNull();
    expect(playedCondition(null)).toBeNull();
    expect(playedCondition("Mint")).toBeNull();
  });
});

describe("learnFactors", () => {
  it("uses defaults with too few cards", () => {
    const r = learnFactors(Array.from({ length: MIN_SAMPLES - 1 }, () => row(10, 9)));
    expect(r.factors).toEqual(DEFAULT_FACTORS);
    expect(r.samples.lp).toBe(0);
  });

  it("learns the median ratio from cards worth $5+ near mint", () => {
    const rows = [
      ...Array.from({ length: 10 }, () => row(10, 8.5)),
      ...Array.from({ length: 11 }, () => row(20, 18)),
      // Cheap cards don't count: condition barely moves their price
      ...Array.from({ length: 50 }, () => row(1, 1)),
    ];
    const r = learnFactors(rows);
    expect(r.factors.lp).toBe(0.9);
    expect(r.samples.lp).toBe(21);
    expect(r.factors.mp).toBe(DEFAULT_FACTORS.mp);
  });

  it("caps played above near mint at 1 and keeps worse conditions at or below better ones", () => {
    const rows = Array.from({ length: 25 }, () => row(10, 12, 9.5, null, 9.9));
    const r = learnFactors(rows);
    expect(r.factors.lp).toBe(1);
    expect(r.factors.mp).toBe(0.95);
    expect(r.factors.hp).toBe(DEFAULT_FACTORS.hp);
    // Damaged learned 0.99 but can't beat heavily played
    expect(r.factors.dmg).toBe(DEFAULT_FACTORS.hp);
  });
});

describe("adjustForCondition", () => {
  it("scales played copies and leaves near mint as is", () => {
    expect(adjustForCondition(100, "Lightly Played", DEFAULT_FACTORS)).toBe(80);
    expect(adjustForCondition(19.99, "Damaged", DEFAULT_FACTORS)).toBe(7);
    expect(adjustForCondition(100, "Near Mint", DEFAULT_FACTORS)).toBe(100);
    expect(adjustForCondition(100, null, DEFAULT_FACTORS)).toBe(100);
  });
});

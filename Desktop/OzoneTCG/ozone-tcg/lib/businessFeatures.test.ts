import { describe, expect, it } from "vitest";
import {
  BUSINESS_STRUCTURE_DESCRIPTIONS,
  BUSINESS_STRUCTURE_LABELS,
  partnershipFeatures,
  scheduleCEligible,
  taxFeaturesEnabled,
  type BusinessStructure,
} from "./businessFeatures";
import { TAX_SAVINGS_RATE, estimateTaxSavings } from "./taxEstimate";

const ALL: BusinessStructure[] = ["hobby", "sole_prop", "single_llc", "multi_llc"];

describe("taxFeaturesEnabled", () => {
  it("hides tax UI for hobbyists", () => {
    expect(taxFeaturesEnabled("hobby")).toBe(false);
  });

  it("shows tax UI for every business structure", () => {
    for (const s of ALL.filter((s) => s !== "hobby")) {
      expect(taxFeaturesEnabled(s)).toBe(true);
    }
  });
});

describe("scheduleCEligible", () => {
  it("applies to sole proprietors and single-member LLCs", () => {
    expect(scheduleCEligible("sole_prop")).toBe(true);
    expect(scheduleCEligible("single_llc")).toBe(true);
  });

  it("does not apply to hobbyists or partnerships", () => {
    expect(scheduleCEligible("hobby")).toBe(false);
    expect(scheduleCEligible("multi_llc")).toBe(false);
  });
});

describe("partnershipFeatures", () => {
  it("applies only to multi-member LLCs", () => {
    expect(partnershipFeatures("multi_llc")).toBe(true);
    for (const s of ALL.filter((s) => s !== "multi_llc")) {
      expect(partnershipFeatures(s)).toBe(false);
    }
  });
});

describe("filing-mode exclusivity", () => {
  it("never offers Schedule C and partnership filing at the same time", () => {
    for (const s of ALL) {
      expect(scheduleCEligible(s) && partnershipFeatures(s)).toBe(false);
    }
  });

  it("only offers a filing mode when tax features are on", () => {
    for (const s of ALL) {
      if (scheduleCEligible(s) || partnershipFeatures(s)) {
        expect(taxFeaturesEnabled(s)).toBe(true);
      }
    }
  });
});

describe("business structure copy", () => {
  it("has a label and description for every structure", () => {
    for (const s of ALL) {
      expect(BUSINESS_STRUCTURE_LABELS[s]).toBeTruthy();
      expect(BUSINESS_STRUCTURE_DESCRIPTIONS[s]).toBeTruthy();
    }
  });
});

describe("estimateTaxSavings", () => {
  it("applies the combined federal + self-employment rate", () => {
    expect(estimateTaxSavings(1000)).toBeCloseTo(1000 * TAX_SAVINGS_RATE, 10);
    expect(estimateTaxSavings(100)).toBeCloseTo(27, 10);
  });

  it("returns zero for no deductible spend", () => {
    expect(estimateTaxSavings(0)).toBe(0);
  });

  it("scales linearly with the deductible amount", () => {
    expect(estimateTaxSavings(2000)).toBeCloseTo(estimateTaxSavings(1000) * 2, 10);
  });
});

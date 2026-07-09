export type BusinessStructure = "hobby" | "sole_prop" | "single_llc" | "multi_llc";

/** Whether tax-oriented UI (deductible %, mileage, IRS warnings) should show. */
export function taxFeaturesEnabled(structure: BusinessStructure): boolean {
  return structure !== "hobby";
}

/** Whether Schedule C export and single-filer tax report features apply. */
export function scheduleCEligible(structure: BusinessStructure): boolean {
  return structure === "sole_prop" || structure === "single_llc";
}

/** Whether multi-member partnership features (K-1, Form 1065) apply. */
export function partnershipFeatures(structure: BusinessStructure): boolean {
  return structure === "multi_llc";
}

export const BUSINESS_STRUCTURE_LABELS: Record<BusinessStructure, string> = {
  hobby:      "Hobby / Personal",
  sole_prop:  "Sole Proprietor",
  single_llc: "Single-Member LLC",
  multi_llc:  "Multi-Member LLC / Partnership",
};

export const BUSINESS_STRUCTURE_DESCRIPTIONS: Record<BusinessStructure, string> = {
  hobby:      "I sell casually and don't file as a business",
  sole_prop:  "I file Schedule C on my personal taxes",
  single_llc: "I have an LLC but file Schedule C",
  multi_llc:  "We file Form 1065 as a partnership",
};

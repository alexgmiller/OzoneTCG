export const TAX_SAVINGS_RATE = 0.27;

export const TAX_SAVINGS_DISCLAIMER =
  "Estimate based on 27% combined federal + self-employment tax. Actual savings vary by income bracket and state.";

export function estimateTaxSavings(deductibleAmount: number): number {
  return deductibleAmount * TAX_SAVINGS_RATE;
}

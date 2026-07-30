/**
 * Pay-period settlement math.
 *
 * Split out from the Supabase server action so the arithmetic can be tested
 * without a database. The action fetches rows for the period; this decides
 * who owes whom.
 */

export type PayoutExpenseRow = { paid_by: string | null; cost: number | null };
export type PayoutItemCostRow = { owner: string | null; cost: number | null };
export type PayoutSaleRow = { sold_price: number | null };
export type PayoutConsignerSaleRow = {
  sold_price: number | null;
  consigner_payout: number | null;
};

export type PayoutTotals = {
  /** Out-of-pocket spend by Alex this period (expenses + unsold inventory cost). */
  alexPaid: number;
  /** Out-of-pocket spend by Mila this period. */
  milaPaid: number;
  /** Shared revenue: shared-owner sales plus our cut of consigner sales. */
  sharedSales: number;
  /** > 0 → Alex pays Mila. < 0 → Mila pays Alex. */
  netPayout: number;
};

function sum(values: Array<number | null | undefined>): number {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}

/**
 * Each partner is entitled to half of shared sales and owes half of what the
 * other fronted, so the settlement reduces to:
 *
 *   net = 0.5 × sharedSales + 0.5 × milaPaid − 0.5 × alexPaid
 *
 * A positive result means Alex settles up to Mila.
 */
export function computePayoutTotals(
  expenses: PayoutExpenseRow[],
  itemCosts: PayoutItemCostRow[],
  sales: PayoutSaleRow[],
  consignerSales: PayoutConsignerSaleRow[]
): PayoutTotals {
  const alexPaid =
    sum(expenses.filter((e) => e.paid_by === "alex").map((e) => e.cost)) +
    sum(itemCosts.filter((i) => i.owner === "alex").map((i) => i.cost));

  const milaPaid =
    sum(expenses.filter((e) => e.paid_by === "mila").map((e) => e.cost)) +
    sum(itemCosts.filter((i) => i.owner === "mila").map((i) => i.cost));

  // On consigner sales only the spread above the consigner's payout is ours.
  const consignerCut = sum(
    consignerSales.map((s) => (s.sold_price ?? 0) - (s.consigner_payout ?? 0))
  );
  const sharedSales = sum(sales.map((s) => s.sold_price)) + consignerCut;

  const netPayout = 0.5 * sharedSales + 0.5 * milaPaid - 0.5 * alexPaid;

  return { alexPaid, milaPaid, sharedSales, netPayout };
}

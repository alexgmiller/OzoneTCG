import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type PartnerPayment = {
  id: string;
  description: string;
  cost: number;
  paid_by: "alex" | "mila";
  created_at: string;
};

// Cash a partner fronted through POS (buys, trade cash-outs), shaped like an
// expense so payout treats it the same as a personally paid expense. Buys of
// personally owned cards are skipped: payout already tracks those as items.
export async function partnerPosPayments(
  supabase: Supabase,
  workspaceId: string,
  since: string | null,
): Promise<PartnerPayment[]> {
  let q = supabase.from("card_transactions")
    .select("id,trade_group_id,transaction_type,cash_paid,cash_difference,paid_by,date,counterparty,card:items!card_id(owner)")
    .eq("workspace_id", workspaceId)
    .in("paid_by", ["alex", "mila"])
    .in("transaction_type", ["buy", "trade_in", "trade_out"]);
  if (since) q = q.gt("date", since);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const deals = new Map<string, PartnerPayment>();
  for (const r of data ?? []) {
    const id = (r.trade_group_id ?? r.id) as string;
    const isBuy = r.transaction_type === "buy";
    const owner = (r.card as unknown as { owner: string } | null)?.owner;
    if (isBuy && owner && owner !== "shared") continue;
    // Trade cash is copied onto every row of the deal; count it once
    const cost = isBuy ? Number(r.cash_paid ?? 0) : deals.has(id) ? 0 : Math.max(0, Number(r.cash_difference ?? 0));
    const prev = deals.get(id);
    deals.set(id, {
      id,
      description: `POS ${isBuy ? "buy" : "trade cash"}${r.counterparty ? ` — ${r.counterparty}` : ""}`,
      cost: (prev?.cost ?? 0) + cost,
      paid_by: r.paid_by as "alex" | "mila",
      created_at: r.date as string,
    });
  }
  return [...deals.values()].filter((p) => p.cost > 0);
}

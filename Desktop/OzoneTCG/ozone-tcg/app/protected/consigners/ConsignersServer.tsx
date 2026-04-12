import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import ConsignersClient, { type Consigner, type SoldItem, type PayoutRecord } from "./ConsignersClient";

export default async function ConsignersServer() {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data: rows, error } = await supabase
    .from("consigners")
    .select("id,name,rate,phone,notes,token,created_at")
    .eq("workspace_id", workspaceId)
    .order("name");

  if (error) throw new Error(error.message);

  // Active items: count + market value per consigner
  const { data: activeItemRows } = await supabase
    .from("items")
    .select("consigner_id,market")
    .eq("workspace_id", workspaceId)
    .not("consigner_id", "is", null)
    .neq("status", "sold");

  // Sold items with full details
  const { data: soldRows } = await supabase
    .from("items")
    .select("id,name,consigner_id,sold_price,consigner_payout,sold_at,set_name,card_number")
    .eq("workspace_id", workspaceId)
    .not("consigner_id", "is", null)
    .eq("status", "sold")
    .order("sold_at", { ascending: false });

  // Payout history — table may not exist yet if migration hasn't run
  const { data: payoutRows } = await supabase
    .from("consigner_payouts")
    .select("id,consigner_id,amount,payment_method,date,notes")
    .eq("workspace_id", workspaceId)
    .order("date", { ascending: false });
  // Intentionally ignore error — gracefully degrade if table doesn't exist yet

  // Build per-consigner active stats
  const activeMap = new Map<string, { count: number; market: number }>();
  for (const it of activeItemRows ?? []) {
    if (!it.consigner_id) continue;
    if (!activeMap.has(it.consigner_id)) activeMap.set(it.consigner_id, { count: 0, market: 0 });
    const s = activeMap.get(it.consigner_id)!;
    s.count++;
    s.market += it.market ?? 0;
  }

  // Build per-consigner sold stats + pending payout
  const soldMap = new Map<string, { count: number; revenue: number; pending: number }>();
  const salesMap = new Map<string, SoldItem[]>();
  for (const row of soldRows ?? []) {
    if (!row.consigner_id) continue;
    if (!soldMap.has(row.consigner_id)) soldMap.set(row.consigner_id, { count: 0, revenue: 0, pending: 0 });
    const s = soldMap.get(row.consigner_id)!;
    s.count++;
    s.revenue += row.sold_price ?? 0;
    s.pending += row.consigner_payout ?? 0;

    if (!salesMap.has(row.consigner_id)) salesMap.set(row.consigner_id, []);
    salesMap.get(row.consigner_id)!.push({
      id: row.id,
      name: row.name,
      sold_price: row.sold_price,
      consigner_payout: row.consigner_payout,
      sold_at: row.sold_at,
      set_name: row.set_name,
      card_number: row.card_number,
    });
  }

  // Build per-consigner payout history + total paid out
  const payoutsMap = new Map<string, PayoutRecord[]>();
  const paidOutMap = new Map<string, number>();
  for (const p of payoutRows ?? []) {
    if (!p.consigner_id) continue;
    if (!payoutsMap.has(p.consigner_id)) payoutsMap.set(p.consigner_id, []);
    payoutsMap.get(p.consigner_id)!.push({
      id: p.id,
      amount: p.amount,
      payment_method: p.payment_method,
      date: p.date,
      notes: p.notes,
    });
    paidOutMap.set(p.consigner_id, (paidOutMap.get(p.consigner_id) ?? 0) + p.amount);
  }

  const consigners: Consigner[] = (rows ?? []).map((c) => {
    const active = activeMap.get(c.id) ?? { count: 0, market: 0 };
    const sold = soldMap.get(c.id) ?? { count: 0, revenue: 0, pending: 0 };
    return {
      ...c,
      active_count: active.count,
      active_market_value: active.market,
      sold_count: sold.count,
      sold_revenue: sold.revenue,
      pending_payout: sold.pending,
      total_paid_out: paidOutMap.get(c.id) ?? 0,
      sales: salesMap.get(c.id) ?? [],
      payouts: payoutsMap.get(c.id) ?? [],
    };
  });

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Consigners</h1>
      <ConsignersClient consigners={consigners} />
    </div>
  );
}

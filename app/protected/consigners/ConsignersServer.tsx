import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import ConsignersClient, { type Consigner, type SoldItem } from "./ConsignersClient";

export default async function ConsignersServer() {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data: rows, error } = await supabase
    .from("consigners")
    .select("id,name,rate,phone,notes,token,created_at")
    .eq("workspace_id", workspaceId)
    .order("name");

  if (error) throw new Error(error.message);

  // Active items count and pending payout (sold items with consigner_payout)
  const { data: itemRows } = await supabase
    .from("items")
    .select("consigner_id,status,consigner_payout")
    .eq("workspace_id", workspaceId)
    .not("consigner_id", "is", null);

  const statsMap = new Map<string, { item_count: number; pending_payout: number }>();
  for (const it of itemRows ?? []) {
    if (!it.consigner_id) continue;
    if (!statsMap.has(it.consigner_id)) statsMap.set(it.consigner_id, { item_count: 0, pending_payout: 0 });
    const s = statsMap.get(it.consigner_id)!;
    if (it.status !== "sold") s.item_count++;
    if (it.status === "sold" && it.consigner_payout) s.pending_payout += it.consigner_payout;
  }

  // Sales history per consigner
  const { data: soldRows } = await supabase
    .from("items")
    .select("id,name,consigner_id,sold_price,consigner_payout,sold_at,set_name,card_number")
    .eq("workspace_id", workspaceId)
    .not("consigner_id", "is", null)
    .eq("status", "sold")
    .order("sold_at", { ascending: false });

  const salesMap = new Map<string, SoldItem[]>();
  for (const row of soldRows ?? []) {
    if (!row.consigner_id) continue;
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

  const consigners: Consigner[] = (rows ?? []).map((c) => ({
    ...c,
    item_count: statsMap.get(c.id)?.item_count ?? 0,
    pending_payout: statsMap.get(c.id)?.pending_payout ?? 0,
    sales: salesMap.get(c.id) ?? [],
  }));

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Consigners</h1>
      <ConsignersClient consigners={consigners} />
    </div>
  );
}

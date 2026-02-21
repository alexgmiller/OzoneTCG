import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import SoldClient from "./SoldClient";

export type SoldItem = {
  id: string;
  name: string;
  category: string;
  owner: string;
  condition: string | null;
  market: number | null;
  cost: number | null;
  sold_price: number | null;
  sale_id: string | null;
  sold_at: string | null;
  updated_at: string;
};

export type SaleGroup = {
  saleId: string;
  soldAt: string;
  items: SoldItem[];
  total: number;
};

export default async function SoldServer() {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await supabase
    .from("items")
    .select("id,name,category,owner,condition,market,cost,sold_price,sale_id,sold_at,updated_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "sold")
    .order("sold_at", { ascending: false, nullsFirst: false });

  if (error) throw new Error(error.message);

  const items = (data ?? []) as SoldItem[];

  // Group by sale_id; items without a sale_id get their own group keyed by item id
  const grouped = new Map<string, SaleGroup>();
  for (const item of items) {
    const key = item.sale_id ?? item.id;
    const date = item.sold_at ?? item.updated_at;
    if (!grouped.has(key)) {
      grouped.set(key, { saleId: key, soldAt: date, items: [], total: 0 });
    }
    const g = grouped.get(key)!;
    g.items.push(item);
    g.total += item.sold_price ?? 0;
  }

  const sales = Array.from(grouped.values()).sort((a, b) =>
    b.soldAt.localeCompare(a.soldAt)
  );

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Sales History</h1>
      <SoldClient sales={sales} />
    </div>
  );
}

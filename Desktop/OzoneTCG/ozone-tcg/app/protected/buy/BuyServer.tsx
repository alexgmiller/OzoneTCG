import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import BuyClient, { type InventoryItem } from "./BuyClient";

export default async function BuyServer() {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await supabase
    .from("items")
    .select("id,name,category,owner,condition,market")
    .eq("workspace_id", workspaceId)
    .eq("status", "inventory")
    .not("market", "is", null)
    .order("name");

  if (error) throw new Error(error.message);

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold">Buy / Trade</h1>
      <BuyClient inventoryItems={(data ?? []) as InventoryItem[]} />
    </div>
  );
}

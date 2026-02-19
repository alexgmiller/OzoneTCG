import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import InventoryClient from "./InventoryClient";

type Category = "single" | "slab" | "sealed";
type Owner = "alex" | "mila" | "shared";
type Status = "inventory" | "listed" | "sold";
type Condition = "Near Mint" | "Lightly Played" | "Moderately Played" | "Heavily Played" | "Damaged";

type Item = {
  id: string;
  name: string;
  category: Category;
  owner: Owner;
  status: Status;
  market: number | null;
  cost: number | null;
  condition: Condition;
  notes: string | null;
  created_at: string;
};

export default async function InventoryServer() {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await supabase
    .from("items")
    .select("id,name,category,owner,status,market,cost,condition,notes,created_at")
    .eq("workspace_id", workspaceId)
    .neq("status", "sold")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Inventory</h1>
        <div className="text-sm opacity-70">Workspace: {workspaceId}</div>
      </div>

      <InventoryClient items={(data ?? []) as Item[]} workspaceId={workspaceId} />
    </div>
  );
}

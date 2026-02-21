import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import InventoryClient from "./InventoryClient";

type Category = "single" | "slab" | "sealed";
type Owner = "alex" | "mila" | "shared" | "consigner";
type Status = "inventory" | "listed" | "grading";
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
  consigner_id: string | null;
  image_url: string | null;
  set_name: string | null;
  card_number: string | null;
};

export type ConsignerOption = {
  id: string;
  name: string;
  rate: number;
};

export default async function InventoryServer() {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const [{ data, error }, { data: consignerRows }] = await Promise.all([
    supabase
      .from("items")
      .select("id,name,category,owner,status,market,cost,condition,notes,created_at,consigner_id,image_url,set_name,card_number")
      .eq("workspace_id", workspaceId)
      .neq("status", "sold")
      .order("updated_at", { ascending: false }),
    supabase
      .from("consigners")
      .select("id,name,rate")
      .eq("workspace_id", workspaceId)
      .order("name"),
  ]);

  if (error) throw new Error(error.message);

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Inventory</h1>
        <div className="text-sm opacity-70">Workspace: {workspaceId}</div>
      </div>

      <InventoryClient
        items={(data ?? []) as Item[]}
        consigners={(consignerRows ?? []) as ConsignerOption[]}
        workspaceId={workspaceId}
      />
    </div>
  );
}

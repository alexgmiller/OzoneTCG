import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import PayoutClient from "./PayoutClient";

export type ExpenseEntry = {
  id: string;
  description: string;
  cost: number;
  paid_by: "alex" | "mila";
  created_at: string;
};

export type ItemCostEntry = {
  id: string;
  name: string;
  cost: number;
  owner: "alex" | "mila";
  created_at: string;
};

export type SharedSaleEntry = {
  id: string;
  name: string;
  sold_price: number;
  sold_at: string | null;
};

export type ConsignerSaleEntry = {
  id: string;
  name: string;
  sold_price: number;
  consigner_payout: number;
  sold_at: string | null;
};

export type SoloSaleEntry = {
  id: string;
  name: string;
  owner: "alex" | "mila";
  sold_price: number;
  cost: number | null;
  sold_at: string | null;
};

export type PayPeriod = {
  id: string;
  period_start: string;
  period_end: string;
  alex_paid: number;
  mila_paid: number;
  shared_sales: number;
  net_payout: number;
  notes: string | null;
  created_at: string;
};

export default async function PayoutServer() {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  // History of settled periods
  const { data: periodsData, error: periodsError } = await supabase
    .from("pay_periods")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("period_end", { ascending: false });

  if (periodsError) throw new Error(periodsError.message);

  const history = (periodsData ?? []) as PayPeriod[];
  const lastEnd = history.length > 0 ? history[0].period_end : null;

  // Build queries filtered after last settled period
  let expQuery = supabase
    .from("expenses")
    .select("id,description,cost,paid_by,created_at")
    .eq("workspace_id", workspaceId)
    .in("paid_by", ["alex", "mila"])
    .order("created_at", { ascending: true });

  let itemCostQuery = supabase
    .from("items")
    .select("id,name,cost,owner,created_at")
    .eq("workspace_id", workspaceId)
    .in("owner", ["alex", "mila"])
    .not("cost", "is", null)
    .neq("status", "sold") // only unsold inventory; sold items are accounted for via shared sales
    .neq("solo_confirmed", true) // exclude items marked as personal (no buy-in)
    .order("created_at", { ascending: true });

  let salesQuery = supabase
    .from("items")
    .select("id,name,sold_price,sold_at")
    .eq("workspace_id", workspaceId)
    .eq("owner", "shared")
    .eq("status", "sold")
    .not("sold_price", "is", null)
    .order("sold_at", { ascending: true });

  let soloSalesQuery = supabase
    .from("items")
    .select("id,name,owner,sold_price,cost,sold_at")
    .eq("workspace_id", workspaceId)
    .in("owner", ["alex", "mila"])
    .eq("status", "sold")
    .not("sold_price", "is", null)
    .neq("solo_confirmed", true)
    .order("sold_at", { ascending: true });

  let consignerSalesQuery = supabase
    .from("items")
    .select("id,name,sold_price,consigner_payout,sold_at")
    .eq("workspace_id", workspaceId)
    .eq("owner", "consigner")
    .eq("status", "sold")
    .not("consigner_payout", "is", null)
    .not("sold_price", "is", null)
    .order("sold_at", { ascending: true });

  if (lastEnd) {
    expQuery = expQuery.gt("created_at", lastEnd);
    itemCostQuery = itemCostQuery.gt("created_at", lastEnd);
    salesQuery = salesQuery.gt("sold_at", lastEnd);
    soloSalesQuery = soloSalesQuery.gt("sold_at", lastEnd);
    consignerSalesQuery = consignerSalesQuery.gt("sold_at", lastEnd);
  }

  const [
    { data: expData, error: expError },
    { data: itemData, error: itemError },
    { data: salesData, error: salesError },
    { data: soloData, error: soloError },
    { data: consignerData, error: consignerError },
  ] = await Promise.all([expQuery, itemCostQuery, salesQuery, soloSalesQuery, consignerSalesQuery]);

  if (expError) throw new Error(expError.message);
  if (itemError) throw new Error(itemError.message);
  if (salesError) throw new Error(salesError.message);
  if (soloError) throw new Error(soloError.message);
  if (consignerError) throw new Error(consignerError.message);

  const expenses = (expData ?? []) as ExpenseEntry[];
  const itemCosts = (itemData ?? []) as ItemCostEntry[];
  const sharedSales = (salesData ?? []) as SharedSaleEntry[];
  const soloSales = (soloData ?? []) as SoloSaleEntry[];
  const consignerSales = (consignerData ?? []) as ConsignerSaleEntry[];

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Payout</h1>
      <PayoutClient
        alexExpenses={expenses.filter((e) => e.paid_by === "alex")}
        milaExpenses={expenses.filter((e) => e.paid_by === "mila")}
        alexItems={itemCosts.filter((i) => i.owner === "alex")}
        milaItems={itemCosts.filter((i) => i.owner === "mila")}
        sharedSales={sharedSales}
        soloSales={soloSales}
        consignerSales={consignerSales}
        history={history}
        periodStart={lastEnd}
      />
    </div>
  );
}

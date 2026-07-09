import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import ExpensesClient from "./ExpensesClient";
import type { ExpenseCategory, DocType, SavedLocation } from "./actions";
import type { BusinessStructure } from "@/lib/businessFeatures";

type PaidBy = "alex" | "mila" | "shared";

export type ExpenseRow = {
  id: string;
  description: string;
  cost: number;
  paid_by: PaidBy;
  payment_type: string | null;
  payment_method: string | null;
  vendor_name: string | null;
  category: ExpenseCategory;
  deductible_percentage: number;
  receipt_url: string | null;
  mileage_miles: number | null;
  mileage_rate: number | null;
  expense_date: string;
  show_session_id: string | null;
  updated_by: string | null;
  created_at: string;
  documentation_notes: string | null;
  documentation_type: DocType | null;
  mileage_from: string | null;
  mileage_to: string | null;
};

export type ShowSessionSummary = {
  id: string;
  name: string;
  date: string;
  venue_address: string | null;
};

export default async function ExpensesServer() {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const [expensesResult, showsResult, workspaceResult, locationsResult] = await Promise.all([
    supabase
      .from("expenses")
      .select(
        "id,description,cost,paid_by,payment_type,payment_method,vendor_name," +
        "category,deductible_percentage,receipt_url,mileage_miles,mileage_rate," +
        "mileage_from,mileage_to,expense_date,show_session_id,updated_by,created_at," +
        "documentation_notes,documentation_type"
      )
      .eq("workspace_id", workspaceId)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("show_sessions")
      .select("id,name,date,venue_address")
      .eq("workspace_id", workspaceId)
      .order("date", { ascending: false })
      .limit(50),
    supabase
      .from("workspaces")
      .select("business_structure,home_address")
      .eq("id", workspaceId)
      .maybeSingle(),
    supabase
      .from("workspace_saved_locations")
      .select("id,label,address,use_count,last_used")
      .eq("workspace_id", workspaceId)
      .order("use_count", { ascending: false })
      .limit(20),
  ]);

  if (expensesResult.error) throw new Error(expensesResult.error.message);

  const businessStructure: BusinessStructure =
    (workspaceResult.data?.business_structure as BusinessStructure | null) ?? "sole_prop";
  const homeAddress = (workspaceResult.data?.home_address as string | null) ?? null;
  const savedLocations = (locationsResult.data ?? []) as unknown as SavedLocation[];

  return (
    <div className="w-full py-4 sm:py-6 space-y-4 max-w-4xl mx-auto overflow-x-hidden">
      <ExpensesClient
        workspaceId={workspaceId}
        initialExpenses={(expensesResult.data ?? []) as unknown as ExpenseRow[]}
        showSessions={(showsResult.data ?? []) as unknown as ShowSessionSummary[]}
        businessStructure={businessStructure}
        homeAddress={homeAddress}
        savedLocations={savedLocations}
      />
    </div>
  );
}

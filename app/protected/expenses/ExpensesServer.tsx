import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import ExpensesClient from "./ExpensesClient";

type PaidBy = "alex" | "mila" | "shared";

export type ExpenseRow = {
  id: string;
  description: string;
  cost: number;
  paid_by: PaidBy;
  payment_type: string | null;
  updated_by: string | null;
  created_at: string;
};

export default async function ExpensesServer() {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await supabase
    .from("expenses")
    .select("id,description,cost,paid_by,payment_type,updated_by,created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Expenses</h1>
        <div className="text-sm opacity-70">Workspace: {workspaceId}</div>
      </div>

      <ExpensesClient workspaceId={workspaceId} initialExpenses={(data ?? []) as ExpenseRow[]} />
    </div>
  );
}

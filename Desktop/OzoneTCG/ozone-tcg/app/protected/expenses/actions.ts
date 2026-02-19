"use server";

import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";

type PaidBy = "alex" | "mila" | "shared";

export async function addExpense(form: {
  description: string;
  cost: number;
  paid_by: PaidBy;
  payment_type?: string | null;
}) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? null;

  const { error } = await supabase.from("expenses").insert({
    workspace_id: workspaceId,
    paid_by: form.paid_by,
    description: form.description,
    cost: form.cost,
    payment_type: form.payment_type ?? null,
    updated_by: userId,
  });

  if (error) throw new Error(error.message);
}

export async function updateExpense(
  id: string,
  patch: Partial<{
    description: string;
    cost: number;
    paid_by: PaidBy;
    payment_type: string | null;
  }>
) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? null;

  const { error } = await supabase
    .from("expenses")
    .update({ ...patch, updated_by: userId })
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);
}

export async function deleteExpense(id: string) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { error } = await supabase.from("expenses").delete().eq("id", id).eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);
}

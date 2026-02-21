"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";

export type ConsignerInput = {
  name: string;
  rate: number;
  phone?: string | null;
  notes?: string | null;
};

export async function createConsigner(input: ConsignerInput) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { error } = await supabase.from("consigners").insert({
    workspace_id: workspaceId,
    name: input.name.trim(),
    rate: input.rate,
    phone: input.phone?.trim() || null,
    notes: input.notes?.trim() || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/protected/consigners");
}

export async function updateConsigner(id: string, input: ConsignerInput) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { error } = await supabase
    .from("consigners")
    .update({
      name: input.name.trim(),
      rate: input.rate,
      phone: input.phone?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  revalidatePath("/protected/consigners");
  revalidatePath("/protected/inventory");
}

export async function deleteConsigner(id: string) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { error } = await supabase
    .from("consigners")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  revalidatePath("/protected/consigners");
  revalidatePath("/protected/inventory");
}

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

export async function recordPayout(input: {
  consignerId: string;
  amount: number;
  paymentMethod: string;
  date: string;
  notes: string | null;
}) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { error } = await supabase.from("consigner_payouts").insert({
    workspace_id: workspaceId,
    consigner_id: input.consignerId,
    amount: parseFloat(input.amount.toFixed(2)),
    payment_method: input.paymentMethod,
    date: input.date,
    notes: input.notes || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/protected/consigners");
}

export type ReceiveCardInput = {
  name: string;
  set_name: string | null;
  card_number: string | null;
  condition: "Near Mint" | "Lightly Played" | "Moderately Played" | "Heavily Played" | "Damaged";
  category: "single" | "slab" | "sealed";
  grade: string | null;
  market: number | null;
};

export async function receiveCards(input: {
  consignerId: string;
  cards: ReceiveCardInput[];
}) {
  if (input.cards.length === 0) return;
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data: auth } = await supabase.auth.getUser();

  const now = new Date().toISOString();

  const { error } = await supabase.from("items").insert(
    input.cards.map((card) => ({
      workspace_id: workspaceId,
      name: card.name.trim(),
      set_name: card.set_name?.trim() || null,
      card_number: card.card_number?.trim() || null,
      condition: card.condition,
      category: card.category,
      grade: card.grade?.trim() || null,
      market: card.market,
      owner: "consigner",
      consigner_id: input.consignerId,
      status: "inventory",
      consigned_date: now,
      updated_by: auth.user?.id ?? null,
    }))
  );
  if (error) throw new Error(error.message);
  revalidatePath("/protected/consigners");
  revalidatePath("/protected/inventory");
}

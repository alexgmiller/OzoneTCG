"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function uploadDealPhoto(formData: FormData): Promise<string> {
  const file = formData.get("file") as File;
  if (!file) throw new Error("No file");
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const bytes = await file.arrayBuffer();

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from("deal-photos")
    .upload(path, bytes, { contentType: file.type });
  if (error) throw new Error(error.message);

  const { data } = admin.storage.from("deal-photos").getPublicUrl(path);
  return data.publicUrl;
}

export async function createDealLog(payload: {
  type: "buy" | "sell" | "trade";
  notes: string | null;
  photos: string[];
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("deal_logs")
    .insert({ ...payload, user_id: user.id })
    .select("id, type, notes, photos, resolved, created_at")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function toggleDealResolved(id: string, resolved: boolean) {
  const admin = createAdminClient();
  const { error } = await admin.from("deal_logs").update({ resolved }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteDealLog(id: string, photoPaths: string[]) {
  const admin = createAdminClient();
  if (photoPaths.length > 0) {
    await admin.storage.from("deal-photos").remove(photoPaths);
  }
  const { error } = await admin.from("deal_logs").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

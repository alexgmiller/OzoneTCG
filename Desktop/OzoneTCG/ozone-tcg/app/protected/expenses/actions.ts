"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { revalidatePath } from "next/cache";

type PaidBy = "alex" | "mila" | "shared";

export type ExpenseCategory =
  | "mileage" | "meals" | "lodging" | "booth_fee" | "supplies"
  | "shipping" | "software" | "grading_fees" | "other";

export type DocType =
  | "receipt" | "payment_screenshot" | "statement"
  | "written_record" | "email" | "none";

export type SavedLocation = {
  id: string;
  label: string;
  address: string;
  use_count: number;
  last_used: string;
};

// ── Saved location helpers ────────────────────────────────────────────────────

function derivedLabel(address: string): string {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  const label = parts.slice(0, 2).join(", ");
  return label.length > 30 ? label.slice(0, 27) + "…" : label;
}

async function _upsertLocation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  address: string,
  label?: string,
): Promise<void> {
  const normalised = address.trim();
  if (!normalised) return;

  // Check for existing
  const { data: existing } = await supabase
    .from("workspace_saved_locations")
    .select("id, use_count")
    .eq("workspace_id", workspaceId)
    .ilike("address", normalised)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("workspace_saved_locations")
      .update({ use_count: existing.use_count + 1, last_used: new Date().toISOString() })
      .eq("id", existing.id);
    return;
  }

  // Count existing — prune least-used if at cap
  const { count } = await supabase
    .from("workspace_saved_locations")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  if ((count ?? 0) >= 20) {
    const { data: leastUsed } = await supabase
      .from("workspace_saved_locations")
      .select("id")
      .eq("workspace_id", workspaceId)
      .order("use_count", { ascending: true })
      .order("last_used", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (leastUsed) {
      await supabase.from("workspace_saved_locations").delete().eq("id", leastUsed.id);
    }
  }

  await supabase.from("workspace_saved_locations").insert({
    workspace_id: workspaceId,
    address: normalised,
    label: label ?? derivedLabel(normalised),
  });
}

export async function upsertSavedLocation(address: string, label?: string): Promise<void> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  await _upsertLocation(supabase, workspaceId, address, label);
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export async function addExpense(form: {
  description: string;
  cost: number;
  paid_by: PaidBy;
  payment_type?: string | null;
  payment_method?: string | null;
  vendor_name?: string | null;
  category?: ExpenseCategory;
  deductible_percentage?: number;
  expense_date?: string;
  mileage_miles?: number | null;
  mileage_rate?: number | null;
  mileage_from?: string | null;
  mileage_to?: string | null;
  show_session_id?: string | null;
  documentation_notes?: string | null;
  documentation_type?: DocType;
}): Promise<{ id: string }> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data: auth } = await supabase.auth.getUser();

  const { data, error } = await supabase.from("expenses").insert({
    workspace_id: workspaceId,
    paid_by: form.paid_by,
    description: form.description,
    cost: form.cost,
    payment_type: form.payment_type ?? null,
    payment_method: form.payment_method ?? null,
    vendor_name: form.vendor_name ?? null,
    category: form.category ?? "other",
    deductible_percentage: form.deductible_percentage ?? 100,
    expense_date: form.expense_date ?? new Date().toISOString().slice(0, 10),
    mileage_miles: form.mileage_miles ?? null,
    mileage_rate: form.mileage_rate ?? null,
    mileage_from: form.mileage_from ?? null,
    mileage_to: form.mileage_to ?? null,
    show_session_id: form.show_session_id ?? null,
    documentation_notes: form.documentation_notes ?? null,
    documentation_type: form.documentation_type ?? "none",
    updated_by: auth.user?.id ?? null,
  }).select("id").single();

  if (error) throw new Error(error.message);

  // Auto-save addresses to saved_locations
  if (form.category === "mileage") {
    const tasks: Promise<void>[] = [];
    if (form.mileage_from?.trim()) tasks.push(_upsertLocation(supabase, workspaceId, form.mileage_from));
    if (form.mileage_to?.trim()) tasks.push(_upsertLocation(supabase, workspaceId, form.mileage_to));
    await Promise.all(tasks);
  }

  revalidatePath("/protected/expenses");
  return { id: data.id as string };
}

export async function updateExpense(
  id: string,
  patch: Partial<{
    description: string;
    cost: number;
    paid_by: PaidBy;
    payment_type: string | null;
    payment_method: string | null;
    vendor_name: string | null;
    category: ExpenseCategory;
    deductible_percentage: number;
    expense_date: string;
    mileage_miles: number | null;
    mileage_rate: number | null;
    mileage_from: string | null;
    mileage_to: string | null;
    show_session_id: string | null;
    documentation_notes: string | null;
    documentation_type: DocType;
  }>
) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data: auth } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("expenses")
    .update({ ...patch, updated_by: auth.user?.id ?? null })
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  // Auto-save mileage addresses
  if (patch.category === "mileage" || patch.mileage_from || patch.mileage_to) {
    const tasks: Promise<void>[] = [];
    if (patch.mileage_from?.trim()) tasks.push(_upsertLocation(supabase, workspaceId, patch.mileage_from));
    if (patch.mileage_to?.trim()) tasks.push(_upsertLocation(supabase, workspaceId, patch.mileage_to));
    await Promise.all(tasks);
  }

  revalidatePath("/protected/expenses");
}

export async function deleteExpense(id: string) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);
  revalidatePath("/protected/expenses");
}

export async function uploadExpenseReceipt(
  expenseId: string,
  formData: FormData,
  docType: DocType = "receipt"
): Promise<string> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const workspaceId = await getWorkspaceId();

  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const ext = file.type.includes("png") ? "png" : "jpg";
  const path = `${workspaceId}/${expenseId}.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error: upErr } = await admin.storage
    .from("receipts")
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (upErr) throw new Error(upErr.message);

  const { data } = admin.storage.from("receipts").getPublicUrl(path);
  const url = data.publicUrl;

  const { error: dbErr } = await supabase
    .from("expenses")
    .update({ receipt_url: url, documentation_type: docType })
    .eq("id", expenseId)
    .eq("workspace_id", workspaceId);
  if (dbErr) throw new Error(dbErr.message);

  revalidatePath("/protected/expenses");
  return url;
}

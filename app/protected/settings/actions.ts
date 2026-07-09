"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { BusinessStructure } from "@/lib/businessFeatures";

export type UserSettings = {
  display_name: string | null;
  business_name: string | null;
  default_buy_pct: number;
  default_trade_pct: number;
  default_consigner_rate: number;
  drop_threshold: number;
  rise_threshold: number;
  spike_threshold: number;
  default_view: string;
  theme: string;
  currency: string;
  default_sort: string;
  price_alert_threshold: number;
  guest_display_name: string | null;
  /** FMV tier strategy. Requires: ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS pricing_strategy TEXT DEFAULT 'auto'; */
  pricing_strategy: "auto" | "q1" | "median" | "q3";
  /** PSA grading cost per card in USD. Requires: ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS grading_cost NUMERIC DEFAULT 20; */
  grading_cost: number;
};

const SETTINGS_DEFAULTS: UserSettings = {
  display_name: null,
  business_name: "OzoneTCG",
  default_buy_pct: 70,
  default_trade_pct: 80,
  default_consigner_rate: 85,
  drop_threshold: 10,
  rise_threshold: 10,
  spike_threshold: 25,
  default_view: "list",
  theme: "system",
  currency: "USD",
  default_sort: "date-desc",
  price_alert_threshold: 15,
  guest_display_name: null,
  pricing_strategy: "auto",
  grading_cost: 20,
};

export async function loadSettings(): Promise<UserSettings> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");

  const { data } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  return { ...SETTINGS_DEFAULTS, ...(data ?? {}) } as UserSettings;
}

export async function saveSettings(patch: Partial<UserSettings>): Promise<void> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");

  const { error } = await supabase.from("user_settings").upsert(
    { user_id: auth.user.id, ...patch, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );

  if (error) throw new Error(error.message);
  revalidatePath("/protected/settings");
}

export async function sendPasswordResetEmail(): Promise<void> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.email) throw new Error("No email found");
  const { error } = await supabase.auth.resetPasswordForEmail(auth.user.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/reset-password`,
  });
  if (error) throw new Error(error.message);
}

export async function deleteAccount(): Promise<void> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(auth.user.id);
  if (error) throw new Error(error.message);

  const cookieStore = await cookies();
  cookieStore.delete("guestMode");
  redirect("/auth/login");
}

// ── Workspace (business structure) ────────────────────────────────────────────

export type WorkspaceData = {
  business_structure: BusinessStructure;
  business_name: string | null;
  business_ein: string | null;
  business_state: string | null;
  s_corp_election: boolean;
  business_structure_confirmed: boolean;
  home_address: string | null;
};

export type SavedLocation = {
  id: string;
  label: string;
  address: string;
  use_count: number;
  last_used: string;
  created_at: string;
};

const WORKSPACE_DEFAULTS: WorkspaceData = {
  business_structure: "sole_prop",
  business_name: null,
  business_ein: null,
  business_state: null,
  s_corp_election: false,
  business_structure_confirmed: false,
  home_address: null,
};

export async function loadWorkspaceData(): Promise<WorkspaceData> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data } = await supabase
    .from("workspaces")
    .select("business_structure,business_name,business_ein,business_state,s_corp_election,business_structure_confirmed,home_address")
    .eq("id", workspaceId)
    .maybeSingle();

  return { ...WORKSPACE_DEFAULTS, ...(data ?? {}) } as WorkspaceData;
}

export async function updateHomeAddress(address: string): Promise<void> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { error } = await supabase
    .from("workspaces")
    .update({ home_address: address.trim() || null })
    .eq("id", workspaceId);
  if (error) throw new Error(error.message);
  revalidatePath("/protected/settings");
}

// ── Saved locations management ────────────────────────────────────────────────

export async function getSavedLocations(): Promise<SavedLocation[]> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data, error } = await supabase
    .from("workspace_saved_locations")
    .select("id,label,address,use_count,last_used,created_at")
    .eq("workspace_id", workspaceId)
    .order("use_count", { ascending: false })
    .order("last_used", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SavedLocation[];
}

export async function updateSavedLocationLabel(id: string, label: string): Promise<void> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { error } = await supabase
    .from("workspace_saved_locations")
    .update({ label: label.trim() })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  revalidatePath("/protected/settings");
}

export async function deleteSavedLocation(id: string): Promise<void> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { error } = await supabase
    .from("workspace_saved_locations")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  revalidatePath("/protected/settings");
}

export async function updateBusinessStructure(patch: {
  business_structure: BusinessStructure;
  business_name?: string | null;
  business_ein?: string | null;
  business_state?: string | null;
  s_corp_election?: boolean;
}): Promise<void> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { error } = await supabase
    .from("workspaces")
    .update({
      ...patch,
      business_structure_confirmed: true,
    })
    .eq("id", workspaceId);

  if (error) throw new Error(error.message);
  revalidatePath("/protected/settings");
  revalidatePath("/protected/expenses");
}

// ── CSV export helpers ────────────────────────────────────────────────────────

function esc(v: unknown): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

export async function exportExpensesCSV(): Promise<string> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  type ExpenseRow = {
    expense_date: string; description: string | null; vendor_name: string | null;
    category: string; cost: number; deductible_percentage: number;
    paid_by: string; payment_method: string | null; mileage_miles: number | null;
    mileage_rate: number | null; receipt_url: string | null;
    documentation_type: string | null; documentation_notes: string | null;
    show_session_id: string | null; created_at: string;
  };

  const { data: rawData, error } = await supabase
    .from("expenses")
    .select(
      "expense_date,description,vendor_name,category,cost,deductible_percentage," +
      "paid_by,payment_method,mileage_miles,mileage_rate,receipt_url," +
      "documentation_type,documentation_notes,show_session_id,created_at"
    )
    .eq("workspace_id", workspaceId)
    .order("expense_date", { ascending: false });

  if (error) throw new Error(error.message);
  const data = (rawData ?? []) as unknown as ExpenseRow[];

  const headers = [
    "Date", "Vendor", "Description", "Category", "Amount", "Deductible %",
    "Deductible Amount", "Paid By", "Payment Method", "Miles", "Rate",
    "Documentation Status", "Documentation Notes", "Receipt URL", "Created At",
  ];

  const rows = data.map((r) => {
    const hasPhoto = !!r.receipt_url;
    const hasNote = !!(r.documentation_notes ?? "").trim();
    const docStatus = hasPhoto && hasNote ? "both" : hasPhoto ? "photo" : hasNote ? "note" : "none";
    const notesExcerpt = (r.documentation_notes ?? "").slice(0, 100);
    const deductibleAmt = r.cost * r.deductible_percentage / 100;

    return [
      r.expense_date, r.vendor_name, r.description, r.category,
      r.cost, r.deductible_percentage, deductibleAmt.toFixed(2),
      r.paid_by, r.payment_method, r.mileage_miles, r.mileage_rate,
      docStatus, notesExcerpt, r.receipt_url, r.created_at,
    ].map(esc).join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

export async function exportInventoryCSV(): Promise<string> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await supabase
    .from("items")
    .select("name,category,condition,grade,set_name,card_number,cost,market,sticker_price,owner,status,notes,created_at")
    .eq("workspace_id", workspaceId)
    .neq("status", "sold")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const headers = ["Name", "Category", "Condition", "Grade", "Set", "Card #", "Cost", "Market", "Sticker Price", "Owner", "Status", "Notes", "Added"];
  const rows = (data ?? []).map((r) =>
    [r.name, r.category, r.condition, r.grade, r.set_name, r.card_number,
      r.cost, r.market, r.sticker_price, r.owner, r.status, r.notes, r.created_at
    ].map(esc).join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

export async function exportTransactionsCSV(): Promise<string> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await supabase
    .from("card_transactions")
    .select("transaction_type,date,cash_paid,market_price_at_time,cost_basis,buy_percentage,trade_credit_value,cash_difference,notes,created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const headers = ["Type", "Date", "Cash Paid", "Market at Time", "Cost Basis", "Buy %", "Trade Credit", "Cash Diff", "Notes", "Created At"];
  const rows = (data ?? []).map((r) =>
    [r.transaction_type, r.date, r.cash_paid, r.market_price_at_time, r.cost_basis,
      r.buy_percentage, r.trade_credit_value, r.cash_difference, r.notes, r.created_at
    ].map(esc).join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

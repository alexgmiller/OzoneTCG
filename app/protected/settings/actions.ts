"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

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

function esc(v: unknown): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
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

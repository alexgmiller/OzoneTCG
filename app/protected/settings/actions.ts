"use server";

import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { revalidatePath } from "next/cache";
import { syncTcgplayer } from "@/lib/catalog/syncTcgplayer";
import { syncProblem } from "@/lib/catalog/tcgplayerSyncStatus";
import { checkPokemonPriceTracker } from "@/lib/pptCheck";
import { debugEbayAsking } from "@/lib/ebay";

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

// ── Workspace ─────────────────────────────────────────────────────────────────

export type WorkspaceData = {
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
  home_address: null,
};

export async function loadWorkspaceData(): Promise<WorkspaceData> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data } = await supabase
    .from("workspaces")
    .select("home_address")
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

  type TxRow = {
    id: string; trade_group_id: string | null; transaction_type: string; date: string;
    card: { name: string } | null; sale_price: number | null; cash_paid: number | null;
    market_price_at_time: number | null; cost_basis: number | null; buy_percentage: number | null;
    cash_difference: number | null; payment_method: string | null; counterparty: string | null;
    paid_by: string | null; show_session_id: string | null; notes: string | null;
  };
  const data = await fetchAll<TxRow>((from, to) =>
    supabase
      .from("card_transactions")
      .select("id,trade_group_id,transaction_type,date,card:items!card_id(name),sale_price,cash_paid,market_price_at_time,cost_basis,buy_percentage,cash_difference,payment_method,counterparty,paid_by,show_session_id,notes")
      .eq("workspace_id", workspaceId)
      .order("date", { ascending: false })
      .range(from, to) as unknown as PromiseLike<{ data: TxRow[] | null; error: { message: string } | null }>);

  const headers = ["Deal", "Type", "Date", "Card", "Sale Price", "Cash Paid", "Market at Time", "Cost Basis", "Buy %", "Cash Diff", "Payment Method", "Counterparty", "Paid By", "Show", "Notes"];
  const rows = data.map((r) =>
    [r.trade_group_id ?? r.id, r.transaction_type, r.date, r.card?.name, r.sale_price, r.cash_paid,
      r.market_price_at_time, r.cost_basis, r.buy_percentage, r.cash_difference, r.payment_method,
      r.counterparty, r.paid_by, r.show_session_id, r.notes
    ].map(esc).join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

// ── Japanese catalog (tcgplayer_cards) ──
// Search's Japanese tab reads TCGplayer's Japanese catalog, refreshed daily by
// /api/cron/sync-tcgplayer. Settings shows its size and age, and can run the
// same sync on demand (a few seconds; it rewrites every card and price).
export type JapaneseCatalogStatus = { cards: number; lastSynced: string | null };

export async function japaneseCatalogStatus(): Promise<JapaneseCatalogStatus> {
  const supabase = await createClient();
  const [countRes, latestRes] = await Promise.all([
    supabase.from("tcgplayer_cards").select("product_id", { count: "exact", head: true }).eq("lang", "ja"),
    supabase.from("tcgplayer_cards").select("updated_at").eq("lang", "ja")
      .order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (countRes.error) throw new Error(countRes.error.message);
  return { cards: countRes.count ?? 0, lastSynced: (latestRes.data as { updated_at: string } | null)?.updated_at ?? null };
}

// Don't re-download ~920 lists when it synced moments ago (double taps)
const SYNC_COOLDOWN_MS = 10 * 60 * 1000;

export type JapaneseSyncResult = { ok: boolean; message: string; status: JapaneseCatalogStatus | null };

export async function syncJapaneseCatalog(): Promise<JapaneseSyncResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");
  // Writes need the service role, which only the deployed app has
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, message: "Syncing runs on the deployed app (it needs the server's Supabase service key).", status: null };
  }

  const before = await japaneseCatalogStatus().catch(() => null);
  if (before?.lastSynced && before.cards > 0 && Date.now() - new Date(before.lastSynced).getTime() < SYNC_COOLDOWN_MS) {
    return { ok: true, message: "Already synced in the last 10 minutes.", status: before };
  }

  try {
    const result = await syncTcgplayer("ja");
    const problem = syncProblem(result);
    console.log(`[settings] Japanese catalog sync: ${result.cards} cards in ${result.ms}ms; ${problem ?? "ok"}`);
    const status = await japaneseCatalogStatus().catch(() => null);
    return problem
      ? { ok: false, message: `Sync failed: ${problem}`, status }
      : { ok: true, message: `Synced ${result.cards.toLocaleString()} Japanese cards`, status };
  } catch (e) {
    return { ok: false, message: `Sync failed: ${e instanceof Error ? e.message : "unknown error"}`, status: before };
  }
}

// ── Check price sources ──
// PokemonPriceTracker for two cards (Psyduck 286/SM-P, a Japanese promo with
// no TCGplayer price, and Charizard ex 199/165, an English card with plenty of
// sales, to show the full data) and one eBay search for Psyduck, returned
// as-is so the data can be compared before building on either. Costs 4
// PokemonPriceTracker credits per tap.
const CHECK_CARD = { label: "Psyduck 286/SM-P (Japanese promo)", tcgPlayerId: 598363, name: "Psyduck", cardNumber: "286/SM-P", lang: "ja" as const };
const CHECK_CARD_EN = { label: "Charizard ex 199/165 (151)", tcgPlayerId: 517045 };

export async function checkPriceSources() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");
  const [japanese, english, ebayListings] = await Promise.all([
    checkPokemonPriceTracker(CHECK_CARD.tcgPlayerId, "ja"),
    checkPokemonPriceTracker(CHECK_CARD_EN.tcgPlayerId, "en"),
    debugEbayAsking({ name: CHECK_CARD.name, cardNumber: CHECK_CARD.cardNumber, lang: CHECK_CARD.lang }),
  ]);
  return {
    checkedAt: new Date().toISOString(),
    ebayListings: { card: CHECK_CARD.label, ...ebayListings },
    pokemonPriceTracker: {
      japanese: { card: CHECK_CARD.label, ...japanese },
      english: { card: CHECK_CARD_EN.label, ...english },
    },
  };
}

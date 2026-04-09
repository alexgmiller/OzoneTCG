import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { makeSlabPriceKey, type SlabSale } from "@/lib/ebay";
import { makeRawCardPriceKey } from "@/lib/justtcg";
import InventoryClient from "./InventoryClient";

type Category = "single" | "slab" | "sealed";
type Owner = "alex" | "mila" | "shared" | "consigner";
type Status = "inventory" | "grading";
type Condition = "Near Mint" | "Lightly Played" | "Moderately Played" | "Heavily Played" | "Damaged";

type Item = {
  id: string;
  name: string;
  category: Category;
  owner: Owner;
  status: Status;
  market: number | null;
  cost: number | null;
  condition: Condition;
  notes: string | null;
  created_at: string;
  consigner_id: string | null;
  image_url: string | null;
  set_name: string | null;
  card_number: string | null;
  grade: string | null;
  cost_basis: number | null;
  buy_percentage: number | null;
  acquisition_type: string | null;
  chain_depth: number;
  original_cash_invested: number | null;
};

export type ConsignerOption = {
  id: string;
  name: string;
  rate: number;
};

export type RawCardPrice = {
  lookup_key: string;
  justtcg_card_id: string | null;
  nm_price: number | null;
  lp_price: number | null;
  mp_price: number | null;
  hp_price: number | null;
  dmg_price: number | null;
  printing: string;
  price_source: string;
  last_updated: string;
  /** NM price history for the past 180 days, sorted ascending. */
  price_history: { date: string; price: number }[] | null;
};

export type SlabPrice = {
  lookup_key: string;
  // Active listings
  median_price: number | null;
  avg_price: number | null;
  low_price: number | null;
  high_price: number | null;
  comp_count: number;
  previous_median: number | null;
  // Sold listings
  sold_median: number | null;
  sold_avg: number | null;
  sold_low: number | null;
  sold_high: number | null;
  sold_count: number;
  fair_market_value: number | null;
  last_updated: string;
  // Raw listing items for detail modal
  active_items: SlabSale[] | null;
  sold_items: SlabSale[] | null;
};

export default async function InventoryServer() {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const [itemsResult, consignersResult] = await Promise.all([
    supabase
      .from("items")
      .select("id,name,category,owner,status,market,cost,condition,notes,created_at,consigner_id,image_url,set_name,card_number,grade,cost_basis,buy_percentage,acquisition_type,chain_depth,original_cash_invested")
      .eq("workspace_id", workspaceId)
      .neq("status", "sold")
      .order("updated_at", { ascending: false }),
    supabase
      .from("consigners")
      .select("id,name,rate")
      .eq("workspace_id", workspaceId)
      .order("name"),
  ]);

  // Log the actual error object so we can see what's failing
  if (itemsResult.error) {
    console.error("[InventoryServer] items query failed:", {
      message: itemsResult.error.message,
      code: itemsResult.error.code,
      details: itemsResult.error.details,
      hint: itemsResult.error.hint,
    });
  }
  if (consignersResult.error) {
    console.error("[InventoryServer] consigners query failed:", consignersResult.error.message);
  }

  // Never crash the page on a DB error — render with whatever data we have
  const data = itemsResult.data;
  const consignerRows = consignersResult.data;

  const admin = createAdminClient();

  // Build lookup keys for all slab items, then fetch their cached prices in one query
  const slabs = (data ?? []).filter((it) => it.category === "slab" && it.grade);
  const slabLookupKeys = slabs.map((it) => {
    const parsed = it.grade?.trim().match(/^([A-Za-z]+)\s+(.+)$/);
    if (!parsed) return null;
    return makeSlabPriceKey(it.name, it.set_name, it.card_number, parsed[1], parsed[2]);
  }).filter(Boolean) as string[];

  let slabPriceMap: Record<string, SlabPrice> = {};
  if (slabLookupKeys.length > 0) {
    const { data: priceRows } = await admin
      .from("slab_prices")
      .select("lookup_key,median_price,avg_price,low_price,high_price,comp_count,previous_median,sold_median,sold_avg,sold_low,sold_high,sold_count,fair_market_value,last_updated,active_items,sold_items")
      .in("lookup_key", slabLookupKeys);
    slabPriceMap = Object.fromEntries((priceRows ?? []).map((r) => [r.lookup_key, r as SlabPrice]));
  }

  // Build lookup keys for raw cards (singles + sealed), fetch their cached TCGPlayer prices
  const rawCards = (data ?? []).filter((it) => it.category !== "slab");
  const rawCardKeys = rawCards.map((it) => makeRawCardPriceKey(it.name, it.set_name, it.card_number));
  const uniqueRawKeys = [...new Set(rawCardKeys)];

  let rawCardPriceMap: Record<string, RawCardPrice> = {};
  if (uniqueRawKeys.length > 0) {
    const { data: rawPriceRows } = await admin
      .from("raw_card_prices")
      .select("lookup_key,justtcg_card_id,nm_price,lp_price,mp_price,hp_price,dmg_price,printing,price_source,last_updated,price_history")
      .in("lookup_key", uniqueRawKeys);
    rawCardPriceMap = Object.fromEntries((rawPriceRows ?? []).map((r) => [r.lookup_key, r as RawCardPrice]));
  }

  const totalItems = (data ?? []).length;
  const slabCount = (data ?? []).filter((i) => i.category === "slab").length;

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold inv-label">Inventory</h1>
        <p className="text-xs opacity-40 mt-0.5 inv-label">
          {totalItems === 0
            ? "Nothing here yet — let's change that 🚀"
            : slabCount > 0
              ? `${slabCount} slab${slabCount !== 1 ? "s" : ""} + ${totalItems - slabCount} raw — looking good ✨`
              : `${totalItems} card${totalItems !== 1 ? "s" : ""} ready to move 🃏`}
        </p>
      </div>

      <InventoryClient
        items={(data ?? []) as Item[]}
        consigners={(consignerRows ?? []) as ConsignerOption[]}
        workspaceId={workspaceId}
        slabPrices={slabPriceMap}
        rawCardPrices={rawCardPriceMap}
      />
    </div>
  );
}

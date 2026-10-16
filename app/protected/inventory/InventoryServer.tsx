import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { makeSlabPriceKey, type SlabSale } from "@/lib/ebay";
import { makeRawCardPriceKey } from "@/lib/justtcg";
import { loadSettings } from "@/app/protected/settings/actions";
import InventoryClient from "./InventoryClient";
import type { Item, ConsignerOption } from "./types";

export type { ConsignerOption } from "./types";

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
  // NM price history for the past 180 days, sorted ascending.
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

const ITEM_COLS = "id,name,category,owner,status,market,cost,condition,notes,created_at,consigner_id,image_url,set_name,card_number,grade,cert_number,cost_basis,buy_percentage,acquisition_type,chain_depth,original_cash_invested,sticker_price,acquired_market_price,acquired_date,product_type,quantity,language";
// Most recent sales only — the Transactions ledger holds the full history
const SOLD_LIMIT = 500;

export default async function InventoryServer({ focusId = null }: { focusId?: string | null }) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const [itemsResult, soldResult, consignersResult, settings] = await Promise.all([
    supabase
      .from("items")
      .select(ITEM_COLS)
      .eq("workspace_id", workspaceId)
      .neq("status", "sold")
      .order("updated_at", { ascending: false }),
    supabase
      .from("items")
      .select(`${ITEM_COLS},sold_price,sold_at`)
      .eq("workspace_id", workspaceId)
      .eq("status", "sold")
      .order("sold_at", { ascending: false, nullsFirst: false })
      .limit(SOLD_LIMIT),
    supabase
      .from("consigners")
      .select("id,name,rate")
      .eq("workspace_id", workspaceId)
      .order("name"),
    loadSettings().catch(() => null),
  ]);

  // JSON.stringify with getOwnPropertyNames keeps the non-enumerable error fields
  // that Next.js drops when serializing across the dev-server→browser boundary.
  if (itemsResult.error) {
    const e = itemsResult.error;
    console.error("[InventoryServer] items query failed:", JSON.stringify(e, Object.getOwnPropertyNames(e)));
  }
  if (soldResult.error) {
    const e = soldResult.error;
    console.error("[InventoryServer] sold items query failed:", JSON.stringify(e, Object.getOwnPropertyNames(e)));
  }
  if (consignersResult.error) {
    const e = consignersResult.error;
    console.error("[InventoryServer] consigners query failed:", JSON.stringify(e, Object.getOwnPropertyNames(e)));
  }

  // Never crash the page on a DB error — render with whatever data we have.
  // Price lookups and header counts cover active items only; sold rows show their sale price.
  const data = itemsResult.data;
  const soldRows = soldResult.data ?? [];
  const consignerRows = consignersResult.data;

  let slabPriceMap: Record<string, SlabPrice> = {};
  let rawCardPriceMap: Record<string, RawCardPrice> = {};

  try {
    const admin = createAdminClient();

    // ── Cached slab prices ──
    const slabs = (data ?? []).filter((it) => it.category === "slab" && it.grade);
    const slabLookupKeys = slabs.map((it) => {
      const parsed = it.grade?.trim().match(/^([A-Za-z]+)\s+(.+)$/);
      if (!parsed) return null;
      return makeSlabPriceKey(it.name, it.set_name, it.card_number, parsed[1], parsed[2]);
    }).filter(Boolean) as string[];

    if (slabLookupKeys.length > 0) {
      const { data: priceRows } = await admin
        .from("slab_prices")
        .select("lookup_key,median_price,avg_price,low_price,high_price,comp_count,previous_median,sold_median,sold_avg,sold_low,sold_high,sold_count,fair_market_value,last_updated,active_items,sold_items")
        .in("lookup_key", slabLookupKeys);
      slabPriceMap = Object.fromEntries((priceRows ?? []).map((r) => [r.lookup_key, r as SlabPrice]));
    }

    // ── Cached TCGPlayer prices (singles + sealed) ──
    const rawCards = (data ?? []).filter((it) => it.category !== "slab");
    const rawCardKeys = rawCards.map((it) => makeRawCardPriceKey(it.name, it.set_name, it.card_number));
    const uniqueRawKeys = [...new Set(rawCardKeys)];

    if (uniqueRawKeys.length > 0) {
      const { data: rawPriceRows } = await admin
        .from("raw_card_prices")
        .select("lookup_key,justtcg_card_id,nm_price,lp_price,mp_price,hp_price,dmg_price,printing,price_source,last_updated,price_history")
        .in("lookup_key", uniqueRawKeys);
      rawCardPriceMap = Object.fromEntries((rawPriceRows ?? []).map((r) => [r.lookup_key, r as RawCardPrice]));
    }
  } catch (e) {
    console.warn("[InventoryServer] Admin client unavailable (build time?), skipping price fetch:", e instanceof Error ? e.message : e);
  }

  return (
    <div className="w-full py-4">
      <h1 className="sr-only">Inventory</h1>
      <InventoryClient
        items={[...(data ?? []), ...soldRows] as Item[]}
        consigners={(consignerRows ?? []) as ConsignerOption[]}
        workspaceId={workspaceId}
        slabPrices={slabPriceMap}
        rawCardPrices={rawCardPriceMap}
        gradingCost={settings?.grading_cost ?? 20}
        focusId={focusId}
      />
    </div>
  );
}

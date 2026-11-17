import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupCard, lookupRawMarketFromTcgDex } from "@/lib/pokemonPriceTracker";
import { justTcgPricedRecently, nightlyMarketSource, usablePrice, type Category, type JustTcgRow } from "@/lib/nightlyPricing";
import { makeRawCardPriceKey } from "@/lib/justtcg";
import { tcgplayerItemPrices } from "@/lib/tcgplayerPrices";
import { historyRows } from "@/lib/priceHistory";
import { lookupEbayAsking } from "@/lib/ebay";
import { estimateFor } from "@/lib/ebayAsking";
import { cardLang } from "@/lib/cardArtMatch";
import { adjustForCondition } from "@/lib/conditionPricing";
import { loadConditionFactors } from "@/lib/conditionFactors";
import { hasMarketSourceColumns, marketStamp, type MarketSource } from "@/lib/marketSource";

// ── Nightly refresh (03:00) ──
// Runs last of the three price jobs (see lib/nightlyPricing.ts for who owns
// which price): fills in images, writes TCGplayer prices (with the older
// sources as fallback) for everything JustTCG didn't price tonight, then
// records each held item's price for its chart (item_price_history) and
// writes the daily inventory snapshot, so the charts see tonight's prices
// rather than yesterday's.

// Allow up to 5 minutes — needed for large inventories (Vercel Pro required for >60s)
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // Verify the request is from the scheduled cron (Vercel sends Authorization header)
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Where each price came from (once migrations/20261116_item_market_source.sql is applied)
  const withSource = await hasMarketSourceColumns(supabase);
  const now = new Date().toISOString();

  // Fetch all non-sold items across all workspaces
  const { data: rows, error } = await supabase
    .from("items")
    .select(`id, workspace_id, name, category, set_name, card_number, image_url, product_type, language, market, condition${withSource ? ", market_source" : ""}`)
    .neq("status", "sold");
  const items = rows as unknown as (ItemRow & { market_source?: string | null })[] | null;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!items?.length) return NextResponse.json({ updated: 0, total: 0 });

  let updated = 0;
  let priced = 0;
  const BATCH = 3; // conservative to avoid hammering TCGdex free API
  const started = Date.now();
  // Leave time for the snapshot inside the 5-minute limit
  const LOOKUP_BUDGET_MS = 4.5 * 60 * 1000;
  const justTcgConfigured = !!process.env.JUSTTCG_API_KEY;

  // Which cards the 02:00 JustTCG job priced tonight (their price stays)
  const justTcgPriced = justTcgConfigured ? await justTcgPricedKeys(supabase, items) : new Set<string>();
  const priceKey = (it: { name: string; set_name: string | null; card_number: string | null }) =>
    makeRawCardPriceKey(it.name, it.set_name, it.card_number);
  const sourceOf = (it: (typeof items)[number]) =>
    nightlyMarketSource(it.category as Category, { justTcgPriced: justTcgPriced.has(priceKey(it)) });

  // TCGplayer prices for the rest, in one pass: a download per set, not per item
  let tcgplayer = new Map<string, number>();
  try {
    tcgplayer = await tcgplayerItemPrices(items.filter((it) => sourceOf(it) === "tcgplayer"));
  } catch (e) {
    console.error("[cron/refresh-prices] TCGplayer pricing failed:", e instanceof Error ? e.message : e);
  }
  let fromTcgplayer = 0;
  let fromEbay = 0;
  // Played singles priced from a one-price source get a condition discount
  const condition = await loadConditionFactors(supabase);
  let conditionAdjusted = 0;

  for (let i = 0; i < items.length; i += BATCH) {
    if (Date.now() - started > LOOKUP_BUDGET_MS) {
      console.warn(`[cron/refresh-prices] time budget reached at ${i}/${items.length} — snapshotting now`);
      break;
    }
    await Promise.all(
      items.slice(i, i + BATCH).map(async (item) => {
        try {
          const category = item.category as Category;
          const source = sourceOf(item);
          const result = await lookupCard(item.name, category, {
            setName: item.set_name, cardNumber: item.card_number,
          });

          // TCGplayer first; without a match, the older source. lookupCard
          // returns early from the image cache with no price, so a single whose
          // art is already cached gets its TCGdex price looked up here.
          let market: number | null = null;
          let marketSource: MarketSource | null = null;
          if (source === "tcgplayer") {
            market = tcgplayer.get(item.id) ?? null;
            if (market != null) { fromTcgplayer++; marketSource = "tcgplayer"; }
            else if (category === "sealed") { market = result?.market ?? null; marketSource = "pokemonpricetracker"; }
            else {
              market = result?.market ?? await lookupRawMarketFromTcgDex(item.name, item.set_name, item.card_number);
              marketSource = "tcgdex";
            }
            // TCGplayer's and TCGdex's single price reads as near mint
            if (category === "single" && usablePrice(market)) {
              const adjusted = adjustForCondition(market, item.condition, condition.factors);
              if (adjusted !== market) conditionAdjusted++;
              market = adjusted;
            }
          }
          // Plan C: a single with no sales price anywhere and no price of its
          // own gets the low end of current eBay listings. It only fills a
          // blank (or refreshes an earlier asking estimate), so a real price is
          // never replaced by an asking price.
          const askingOnly = !usablePrice(item.market) || item.market_source === "ebay_asking";
          if (source === "tcgplayer" && category === "single" && !usablePrice(market) && askingOnly) {
            const lang = /^ja/i.test(item.language ?? "") || cardLang(item) === "ja" ? "ja" : "en";
            const asking = await lookupEbayAsking({ name: item.name, cardNumber: item.card_number, lang });
            // Near mint (or unknown) items read the NM listings, played ones
            // the played listings; a played item without enough played
            // listings gets the near-mint estimate with the condition discount
            const est = asking ? estimateFor(asking, item.condition) : null;
            if (est && asking) {
              const fromPlayedPool = !!asking.played && est === asking.played;
              market = fromPlayedPool ? est.price : adjustForCondition(est.price, item.condition, condition.factors);
              if (market !== est.price) conditionAdjusted++;
              marketSource = "ebay_asking";
            }
            if (usablePrice(market)) fromEbay++;
          }

          const patch: Record<string, unknown> = {};
          // A looked-up image only fills a blank: it never replaces art the item has
          if (result?.imageUrl && !item.image_url) patch.image_url = result.imageUrl;
          // Only overwrite market with a real price (never null-out an existing value)
          if (usablePrice(market)) {
            patch.market = market;
            if (withSource && marketSource) Object.assign(patch, marketStamp(marketSource, now));
            priced++;
          }
          if (Object.keys(patch).length === 0) return;

          const { error: updateErr } = await supabase
            .from("items")
            .update(patch)
            .eq("id", item.id)
            .eq("workspace_id", item.workspace_id);

          if (!updateErr) updated++;
        } catch {
          // Swallow per-item errors so one bad card doesn't abort the whole run
        }
      })
    );
  }

  console.log(`[cron/refresh-prices] updated ${updated} / ${items.length} items (${priced} prices, ${fromTcgplayer} from TCGplayer, ${fromEbay} from eBay asking, ${conditionAdjusted} discounted for condition, ${justTcgPriced.size} kept from JustTCG, JustTCG ${justTcgConfigured ? "on" : "off"})`);
  console.log(`[cron/refresh-prices] condition factors ${JSON.stringify(condition.factors)} from ${JSON.stringify(condition.samples)} cards`);

  // ── Daily inventory snapshot ──
  // One row per workspace per day feeds the Home value chart. Re-read after the
  // updates so the snapshot reflects today's prices. Upsert on (workspace, date)
  // keeps a re-run idempotent.
  const history = await writeItemPriceHistory(supabase);
  const snapshots = await writeInventorySnapshots(supabase);

  return NextResponse.json({
    updated, priced, history, fromTcgplayer, fromEbay, conditionAdjusted, conditionFactors: condition,
    keptFromJustTcg: justTcgPriced.size, total: items.length, justTcgConfigured, snapshots,
  });
}

// Price keys (lib/justtcg → makeRawCardPriceKey) of the singles and sealed
// that JustTCG priced in the last day
async function justTcgPricedKeys(
  supabase: ReturnType<typeof createAdminClient>,
  items: { category: string; name: string; set_name: string | null; card_number: string | null }[],
): Promise<Set<string>> {
  const keys = [...new Set(items
    .filter((it) => it.category === "single" || it.category === "sealed")
    .map((it) => makeRawCardPriceKey(it.name, it.set_name, it.card_number)))];
  const out = new Set<string>();
  for (let i = 0; i < keys.length; i += 100) {
    const { data, error } = await supabase
      .from("raw_card_prices")
      .select("lookup_key,last_updated,nm_price,lp_price,mp_price,hp_price,dmg_price")
      .in("lookup_key", keys.slice(i, i + 100));
    if (error) {
      console.error("[cron/refresh-prices] raw_card_prices read failed:", error.message);
      continue;
    }
    for (const row of (data ?? []) as (JustTcgRow & { lookup_key: string })[]) {
      if (justTcgPricedRecently(row)) out.add(row.lookup_key);
    }
  }
  return out;
}

// ── Item price history ──
// Tonight's market value for every item still held, one row per item per day
// (upsert, so a re-run just rewrites today). The table arrives with
// migrations/20261117_item_price_history.sql; until then this logs and moves on.
async function writeItemPriceHistory(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  const { data, error } = await supabase
    .from("items")
    .select("id, workspace_id, market, status")
    .neq("status", "sold");
  if (error || !data) {
    console.error("[cron/refresh-prices] history read failed:", error?.message);
    return 0;
  }
  const rows = historyRows(data, new Date().toISOString().slice(0, 10));
  let written = 0;
  for (let i = 0; i < rows.length; i += 1000) {
    const { error: upsertErr } = await supabase
      .from("item_price_history")
      .upsert(rows.slice(i, i + 1000), { onConflict: "item_id,date" });
    if (upsertErr) {
      console.error("[cron/refresh-prices] history write failed:", upsertErr.message);
      return written;
    }
    written += Math.min(1000, rows.length - i);
  }
  return written;
}

type ItemRow = {
  id: string; workspace_id: string; name: string; category: string; set_name: string | null; card_number: string | null;
  image_url: string | null; product_type: string | null; language: string | null; market: number | null; condition: string | null;
};

type StockRow = { workspace_id: string; market: number | null; cost: number | null };

async function writeInventorySnapshots(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  const { data, error } = await supabase
    .from("items")
    .select("workspace_id, market, cost")
    .eq("status", "inventory");
  if (error || !data) {
    console.error("[cron/refresh-prices] snapshot read failed:", error?.message);
    return 0;
  }

  const byWorkspace = new Map<string, { total_fmv: number; total_cost: number; item_count: number }>();
  for (const row of data as StockRow[]) {
    const agg = byWorkspace.get(row.workspace_id) ?? { total_fmv: 0, total_cost: 0, item_count: 0 };
    agg.total_fmv += row.market ?? 0;
    agg.total_cost += row.cost ?? 0;
    agg.item_count += 1;
    byWorkspace.set(row.workspace_id, agg);
  }

  const date = new Date().toISOString().slice(0, 10);
  const rows = [...byWorkspace].map(([workspace_id, agg]) => ({ workspace_id, date, ...agg }));
  if (rows.length === 0) return 0;

  const { error: upsertErr } = await supabase
    .from("inventory_snapshots")
    .upsert(rows, { onConflict: "workspace_id,date" });
  if (upsertErr) {
    // The table arrives with migrations/20261016_inventory_snapshots.sql; until
    // it is applied the price refresh must still succeed.
    console.error("[cron/refresh-prices] snapshot write failed:", upsertErr.message);
    return 0;
  }
  return rows.length;
}

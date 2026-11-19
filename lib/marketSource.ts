// ── Where an item's market price came from ──
// The nightly jobs stamp items.market_source / market_updated_at when they
// write items.market (migrations/20261116_item_market_source.sql). Inventory
// shows the source and age, and filters on eBay asking prices, which are
// estimates from current listings rather than sales.

import type { SupabaseClient } from "@supabase/supabase-js";

export type MarketSource = "justtcg" | "tcgplayer" | "tcgdex" | "pokemonpricetracker" | "ebay_asking" | "pokeinvest" | "ebay";

const LABELS: Record<MarketSource, string> = {
  justtcg: "TCGplayer by condition",
  tcgplayer: "TCGplayer",
  tcgdex: "TCGdex",
  pokemonpricetracker: "PokemonPriceTracker",
  ebay_asking: "eBay asking",
  // Slabs: PokeInvest's sold median for the grade, else eBay sold + listings
  pokeinvest: "PokeInvest",
  ebay: "eBay",
};

export function marketSourceLabel(source: string | null | undefined): string | null {
  return source && source in LABELS ? LABELS[source as MarketSource] : null;
}

// The columns to write alongside items.market
export function marketStamp(source: MarketSource, at: string): { market_source: MarketSource; market_updated_at: string } {
  return { market_source: source, market_updated_at: at };
}

// Until the migration is applied the columns don't exist, and writing or
// selecting them would fail the whole query; callers check once and skip them
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function hasMarketSourceColumns(supabase: SupabaseClient<any, any, any>): Promise<boolean> {
  const { error } = await supabase.from("items").select("market_source,market_updated_at").limit(1);
  return !error;
}

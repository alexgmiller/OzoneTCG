// Which market price the 3 AM refresh-prices job may write for an item.
// Three nightly jobs touch items.market; this keeps them from overwriting each
// other with a worse number:
//
//   02:00 refresh-raw-cards   JustTCG, per-condition TCGplayer price (singles, sealed), when configured
//   02:30 refresh-stale-slabs eBay graded comps (slabs)
//   03:00 refresh-prices      images, TCGplayer prices, then the daily snapshot
//
// - Slabs: never. A slab's value is its graded comps; a raw-card price would
//   understate a PSA 10 by an order of magnitude.
// - Singles and sealed that JustTCG priced tonight: keep JustTCG's price, which
//   accounts for condition.
// - Everything else: TCGplayer's market price via TCGCSV (lib/tcgplayerPrices.ts:
//   the item's printing for singles, the exact product for sealed, English or
//   Japanese). When TCGplayer has no match, the older source: TCGdex for
//   singles, PokemonPriceTracker for sealed.

export type Category = "single" | "slab" | "sealed";
export type NightlySource = "none" | "tcgplayer";

export function nightlyMarketSource(category: Category, opts: { justTcgPriced: boolean }): NightlySource {
  if (category === "slab") return "none";
  return opts.justTcgPriced ? "none" : "tcgplayer";
}

// A JustTCG row (raw_card_prices) counts as tonight's price when the 02:00 job
// refreshed it within the last day and it holds at least one price.
export type JustTcgRow = {
  last_updated: string | null;
  nm_price: number | null;
  lp_price: number | null;
  mp_price: number | null;
  hp_price: number | null;
  dmg_price: number | null;
};
const DAY_MS = 24 * 60 * 60 * 1000;

export function justTcgPricedRecently(row: JustTcgRow | undefined, now = Date.now()): boolean {
  if (!row?.last_updated) return false;
  const age = now - new Date(row.last_updated).getTime();
  if (!(age >= 0 && age < DAY_MS)) return false;
  return [row.nm_price, row.lp_price, row.mp_price, row.hp_price, row.dmg_price].some(usablePrice);
}

// A price worth writing: finite and above zero. A missing or zero lookup must
// never wipe out the price an item already has.
export function usablePrice(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

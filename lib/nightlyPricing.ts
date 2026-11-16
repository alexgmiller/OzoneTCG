// Which market price the 3 AM refresh-prices job may write for an item.
// Three nightly jobs touch items.market; this keeps them from overwriting each
// other with a worse number:
//
//   02:00 refresh-raw-cards   JustTCG, per-condition TCGplayer price (singles, sealed)
//   02:30 refresh-stale-slabs eBay graded comps (slabs)
//   03:00 refresh-prices      images, fallback prices, then the daily snapshot
//
// - Slabs: never. A slab's value is its graded comps; a raw-card price would
//   understate a PSA 10 by an order of magnitude.
// - Singles: only when JustTCG isn't configured. Then TCGdex's TCGplayer market
//   (near-mint, no condition split) is the best free number we have.
// - Sealed: the PokemonPriceTracker result from lookupCard, as before.

export type Category = "single" | "slab" | "sealed";
export type NightlySource = "none" | "lookup" | "tcgdex-raw";

export function nightlyMarketSource(category: Category, opts: { justTcgConfigured: boolean }): NightlySource {
  if (category === "slab") return "none";
  if (category === "sealed") return "lookup";
  return opts.justTcgConfigured ? "none" : "tcgdex-raw";
}

// A price worth writing: finite and above zero. A missing or zero lookup must
// never wipe out the price an item already has.
export function usablePrice(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

import { describe, expect, it } from "vitest";
import { freshRawCardPrice, rawItemPrice } from "./utils";
import type { RawCardPrice } from "./InventoryServer";
import type { Item } from "./types";
import { marketSourceLabel } from "@/lib/marketSource";

const NOW = new Date("2026-11-16T12:00:00Z").getTime();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const item = (over: Partial<Item>): Item => ({
  id: "x", name: "Charizard", category: "single", owner: "shared", status: "inventory",
  market: 90, cost: 60, condition: "Lightly Played", notes: null, created_at: "2026-10-01T00:00:00Z",
  consigner_id: null, image_url: null, set_name: "Base Set", card_number: "4", grade: null, cert_number: null,
  cost_basis: null, buy_percentage: null, acquisition_type: null, chain_depth: 0,
  original_cash_invested: null, sticker_price: null, acquired_market_price: null, acquired_date: null,
  product_type: null, quantity: 1, language: "english",
  market_source: "tcgplayer", market_updated_at: daysAgo(0.5),
  ...over,
});

const rcp = (lastUpdated: string): RawCardPrice => ({
  lookup_key: "k", justtcg_card_id: "j", nm_price: 100, lp_price: 85, mp_price: 70, hp_price: 50, dmg_price: 30,
  printing: "Holofoil", price_source: "tcgplayer_via_justtcg", last_updated: lastUpdated, price_history: null,
} as RawCardPrice);

describe("freshRawCardPrice", () => {
  it("keeps JustTCG rows from the last 3 days", () => {
    expect(freshRawCardPrice(rcp(daysAgo(1)), NOW)).not.toBeNull();
    expect(freshRawCardPrice(rcp(daysAgo(4)), NOW)).toBeNull();
    expect(freshRawCardPrice(null, NOW)).toBeNull();
  });
});

describe("rawItemPrice", () => {
  it("uses JustTCG's condition price while it's fresh", () => {
    const p = rawItemPrice(item({}), rcp(daysAgo(1)), NOW);
    expect(p.price).toBe(85);
    expect(p.source).toBe(marketSourceLabel("justtcg"));
  });

  it("uses the item's nightly price over an old JustTCG row", () => {
    const p = rawItemPrice(item({}), rcp(daysAgo(10)), NOW);
    expect(p.price).toBe(90);
    expect(p.source).toBe("TCGplayer");
    expect(p.asking).toBe(false);
  });

  it("falls back to an old JustTCG price when the item has none", () => {
    expect(rawItemPrice(item({ market: null }), rcp(daysAgo(10)), NOW).price).toBe(85);
  });

  it("marks eBay asking estimates", () => {
    const p = rawItemPrice(item({ market: 1580, market_source: "ebay_asking" }), null, NOW);
    expect(p.asking).toBe(true);
    expect(p.source).toBe("eBay asking");
  });

  it("shows no source for a price without one", () => {
    const p = rawItemPrice(item({ market_source: null, market_updated_at: null }), null, NOW);
    expect(p.price).toBe(90);
    expect(p.source).toBeNull();
  });
});

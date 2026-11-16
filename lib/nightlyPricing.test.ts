import { describe, expect, it } from "vitest";
import { justTcgPricedRecently, nightlyMarketSource, usablePrice, type JustTcgRow } from "./nightlyPricing";

describe("nightlyMarketSource", () => {
  it("never prices slabs from raw-card sources", () => {
    expect(nightlyMarketSource("slab", { justTcgPriced: true })).toBe("none");
    expect(nightlyMarketSource("slab", { justTcgPriced: false })).toBe("none");
  });

  it("keeps tonight's JustTCG price for singles and sealed", () => {
    expect(nightlyMarketSource("single", { justTcgPriced: true })).toBe("none");
    expect(nightlyMarketSource("sealed", { justTcgPriced: true })).toBe("none");
  });

  it("prices everything else from TCGplayer", () => {
    expect(nightlyMarketSource("single", { justTcgPriced: false })).toBe("tcgplayer");
    expect(nightlyMarketSource("sealed", { justTcgPriced: false })).toBe("tcgplayer");
  });
});

describe("justTcgPricedRecently", () => {
  const now = Date.parse("2026-11-17T03:00:00Z");
  const row = (o: Partial<JustTcgRow>): JustTcgRow => ({
    last_updated: "2026-11-17T02:05:00Z", nm_price: 12, lp_price: null, mp_price: null, hp_price: null, dmg_price: null, ...o,
  });

  it("counts a row refreshed tonight with a price", () => {
    expect(justTcgPricedRecently(row({}), now)).toBe(true);
    expect(justTcgPricedRecently(row({ nm_price: null, lp_price: 9 }), now)).toBe(true);
  });
  it("ignores stale, priceless or missing rows", () => {
    expect(justTcgPricedRecently(row({ last_updated: "2026-11-15T02:05:00Z" }), now)).toBe(false);
    expect(justTcgPricedRecently(row({ nm_price: null }), now)).toBe(false);
    expect(justTcgPricedRecently(row({ last_updated: null }), now)).toBe(false);
    expect(justTcgPricedRecently(undefined, now)).toBe(false);
  });
});

describe("usablePrice", () => {
  it("accepts positive numbers only", () => {
    expect(usablePrice(12.5)).toBe(true);
    expect(usablePrice(0)).toBe(false);
    expect(usablePrice(null)).toBe(false);
    expect(usablePrice(undefined)).toBe(false);
    expect(usablePrice(Number.NaN)).toBe(false);
  });
});

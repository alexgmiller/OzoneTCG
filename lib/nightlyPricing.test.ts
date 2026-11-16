import { describe, expect, it } from "vitest";
import { nightlyMarketSource, usablePrice } from "./nightlyPricing";

describe("nightlyMarketSource", () => {
  it("never prices slabs from raw-card sources", () => {
    expect(nightlyMarketSource("slab", { justTcgConfigured: true })).toBe("none");
    expect(nightlyMarketSource("slab", { justTcgConfigured: false })).toBe("none");
  });

  it("leaves singles to JustTCG when it is configured", () => {
    expect(nightlyMarketSource("single", { justTcgConfigured: true })).toBe("none");
  });

  it("falls back to TCGdex for singles without JustTCG", () => {
    expect(nightlyMarketSource("single", { justTcgConfigured: false })).toBe("tcgdex-raw");
  });

  it("keeps the lookup price for sealed product", () => {
    expect(nightlyMarketSource("sealed", { justTcgConfigured: true })).toBe("lookup");
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

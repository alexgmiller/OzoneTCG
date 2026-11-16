import { describe, expect, it } from "vitest";
import { askingEstimate, askingQuery, matchingListings, type AskingCard } from "./ebayAsking";

const L = (title: string, price: number) => ({ title, price });

describe("matchingListings", () => {
  const card: AskingCard = { name: "Charizard", cardNumber: "002/PCG-P", lang: "ja" };
  const promo = { name: "Charizard", cardNumber: "002/PCG-P", lang: "ja" as const };

  it("keeps raw listings of this card in its language", () => {
    const kept = matchingListings([
      L("Charizard 002/PCG-P Japanese Promo Pokemon Card NM", 120),
      L("Pokemon Card Japanese Charizard 002 PCG-P Holo Promo 2004", 140),
    ], promo);
    expect(kept).toHaveLength(2);
  });

  it("drops graded copies, lots, proxies, other numbers and other languages", () => {
    const kept = matchingListings([
      L("PSA 9 Charizard 002/PCG-P Japanese Promo", 900),
      L("CGC 8.5 Japanese Charizard 002 PCG-P", 500),
      L("Lot of 3 Charizard 002/PCG-P Japanese", 300),
      L("Charizard 002/PCG-P Japanese PROXY custom card", 5),
      L("Charizard 004/PCG-P Japanese Promo", 80),
      L("Charizard 002/PCG-P Korean Promo", 60),
      L("Blastoise 002/PCG-P Japanese Promo", 70),
    ], card);
    expect(kept).toEqual([]);
  });

  it("requires English cards not to be listed as another language", () => {
    const en: AskingCard = { name: "Mew ex", cardNumber: "232/091", lang: "en" };
    expect(matchingListings([
      L("Mew ex 232/091 Paldean Fates Special Illustration Rare NM", 790),
      L("Mew ex 232/091 Japanese", 400),
      L("Mew ex 0232 Paldean Fates", 800),
      L("Mew ex 23/091 Paldean Fates", 2),
    ], en).map((l) => l.price)).toEqual([790, 800]);
  });

  it("matches letter-prefixed numbers with or without spaces", () => {
    const swsh: AskingCard = { name: "Charizard VSTAR", cardNumber: "SWSH262", lang: "en" };
    expect(matchingListings([L("Charizard VSTAR SWSH 262 Black Star Promo", 60), L("Charizard VSTAR SWSH261", 30)], swsh))
      .toHaveLength(1);
  });
});

describe("askingEstimate", () => {
  const card: AskingCard = { name: "Psyduck (JP)", cardNumber: "286/SM-P", lang: "ja" };
  const t = (p: number) => L(`Psyduck 286/SM-P Japanese Promo Card`, p);

  it("takes the low quarter of the trimmed asking prices", () => {
    const e = askingEstimate([t(40), t(45), t(50), t(60), t(500)], card);
    // $500 is trimmed as an outlier; 25th percentile of 40/45/50/60
    expect(e).toEqual({ price: 43.75, count: 4, low: 40, high: 60 });
  });
  it("needs at least three matching listings", () => {
    expect(askingEstimate([t(40), t(45), L("PSA 10 Psyduck 286/SM-P Japanese", 300)], card)).toBeNull();
  });
});

describe("askingQuery", () => {
  it("searches the bare name, number and language", () => {
    expect(askingQuery({ name: "Psyduck (JP)", cardNumber: "286/SM-P", lang: "ja" })).toBe("Psyduck 286 japanese");
    expect(askingQuery({ name: "Mew ex", cardNumber: "232/091", lang: "en" })).toBe("Mew ex 232");
    expect(askingQuery({ name: "Sabrina's Alakazam", cardNumber: null, lang: "en" })).toBe("Sabrina's Alakazam");
  });
});

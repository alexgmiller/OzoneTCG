import { describe, expect, it } from "vitest";
import {
  facets, matchesCard, nameTerms, pushRecent, rankCatalog, setCardsFrom, setFacets, sortCards, sortSets, toBrowseSet,
  type CatalogCard, type CatalogRow,
} from "./catalog";

const row = (o: Partial<CatalogRow>): CatalogRow => ({
  id: "x", name: "Charizard", set_id: "sv03", set_name: "Obsidian Flames", card_number: "125", image_url: null, ...o,
});

describe("nameTerms", () => {
  it("tries the longest terms with a letter first", () => {
    expect(nameTerms("charizard ex 125")).toEqual(["charizard", "ex"]);
    expect(nameTerms("ex mew")).toEqual(["mew", "ex"]);
    // A set word can outrank the name; the search falls back to the next term
    expect(nameTerms("charizard evolutions 11")).toEqual(["evolutions", "charizard"]);
  });
  it("uses numbers only when there is nothing else", () => {
    expect(nameTerms("151")).toEqual(["151"]);
  });
  it("is empty for an empty query", () => {
    expect(nameTerms("   ")).toEqual([]);
  });
});

describe("rankCatalog", () => {
  it("ignores accents on either side", () => {
    const rows = [row({ id: "a", name: "Pokémon Catcher", set_name: "Emerging Powers" })];
    expect(rankCatalog(rows, "pokemon catcher").map((c) => c.id)).toEqual(["a"]);
    expect(rankCatalog([row({ id: "b", name: "Flabebe" })], "Flabébé").map((c) => c.id)).toEqual(["b"]);
  });

  it("requires every term to match somewhere", () => {
    const rows = [
      row({ id: "a", name: "Charizard ex", set_name: "Obsidian Flames" }),
      row({ id: "b", name: "Charizard", set_name: "Base Set" }),
    ];
    expect(rankCatalog(rows, "charizard obsidian").map((c) => c.id)).toEqual(["a"]);
  });

  it("puts an exact name match first and keeps query order on ties", () => {
    const rows = [
      row({ id: "a", name: "Charizard ex" }),
      row({ id: "b", name: "Charizard" }),
      row({ id: "c", name: "Charizard ex" }),
    ];
    expect(rankCatalog(rows, "charizard").map((c) => c.id)).toEqual(["b", "a", "c"]);
  });

  it("matches card numbers and falls back to the set code for the set name", () => {
    const rows = [row({ id: "a", card_number: "125", set_name: null }), row({ id: "b", card_number: "4" })];
    const [first] = rankCatalog(rows, "charizard 125");
    expect(first.id).toBe("a");
    expect(first.setName).toBe("sv03");
  });

  it("puts cards with art ahead of art-less ones on an equal match", () => {
    const rows = [row({ id: "bare", image_url: null }), row({ id: "art", image_url: "https://x/high.webp" })];
    expect(rankCatalog(rows, "charizard").map((c) => c.id)).toEqual(["art", "bare"]);
  });

  it("caps the result count", () => {
    const rows = Array.from({ length: 60 }, (_, i) => row({ id: String(i) }));
    expect(rankCatalog(rows, "charizard", 10)).toHaveLength(10);
  });
});

describe("matchesCard", () => {
  const card = { name: "Mew ex", setName: "151", setId: "sv03.5", cardNumber: "151", lang: "en" as const };

  it("accepts the set code in place of the set name", () => {
    expect(matchesCard({ id: "i", name: "Mew ex", set_name: "sv03.5", card_number: "151" }, card)).toBe(true);
  });
  const item = (o: object) => ({ id: "i", name: "Mew ex", set_name: "151", card_number: "151", ...o });

  it("matches on name, number and set, ignoring case and leading zeros", () => {
    expect(matchesCard(item({ name: "MEW EX", card_number: "0151" }), card)).toBe(true);
  });
  it("rejects a different number or set", () => {
    expect(matchesCard(item({ card_number: "232" }), card)).toBe(false);
    expect(matchesCard(item({ set_name: "Paldean Fates" }), card)).toBe(false);
  });
  it("accepts an item with no set recorded", () => {
    expect(matchesCard(item({ set_name: null }), card)).toBe(true);
  });
  it("never counts a Japanese copy as the English card", () => {
    expect(matchesCard(item({ name: "Mew ex (JP)" }), card)).toBe(false);
  });
});

describe("matchesCard (Japanese)", () => {
  const card = { name: "Mew ex", setName: "Pokemon Card 151", setId: "SV2a", cardNumber: "151/165", lang: "ja" as const };
  const item = (o: object) => ({ id: "i", name: "Mew ex (JP)", set_name: "Pokemon 151 (Japanese)", card_number: "151/165", ...o });

  it("matches a (JP) item by name, number and set", () => {
    expect(matchesCard(item({}), card)).toBe(true);
    expect(matchesCard(item({ card_number: "151" }), card)).toBe(true);
    expect(matchesCard(item({ set_name: "SV2a" }), card)).toBe(true);
    expect(matchesCard(item({ name: "Mew ex", set_name: "151 JP" }), card)).toBe(true);
  });
  it("ignores TCGplayer's variant tag on the card", () => {
    expect(matchesCard(item({}), { ...card, name: "Mew ex (Master Ball Pattern)" })).toBe(true);
  });
  it("rejects English copies, other numbers and other sets", () => {
    expect(matchesCard(item({ name: "Mew ex", set_name: "151" }), card)).toBe(false);
    expect(matchesCard(item({ card_number: "205/165" }), card)).toBe(false);
    expect(matchesCard(item({ set_name: "VSTAR Universe (Japanese)", card_number: "151/172" }), card)).toBe(false);
  });
  it("lets a promo number stand in for a set name it can't map", () => {
    const promo = { name: "Psyduck", setName: "Sun & Moon Promos", setId: "SM-P", cardNumber: "186/SM-P", lang: "ja" as const };
    expect(matchesCard({ id: "i", name: "Psyduck (JP)", set_name: "Pokemon Center Promo (Japanese)", card_number: "186/SM-P" }, promo)).toBe(true);
    expect(matchesCard({ id: "i", name: "Psyduck (JP)", set_name: "Pokemon Center Promo (Japanese)", card_number: "186" }, promo)).toBe(false);
  });
  it("maps \"Black Star\" promo set names to TCGplayer's Japanese promos", () => {
    const promo = { name: "Psyduck", setName: "Sun & Moon Promos", setId: "SM-P", cardNumber: "186/SM-P", lang: "ja" as const };
    expect(matchesCard({ id: "i", name: "Psyduck (JP)", set_name: "SM Black Star Promos (Japanese)", card_number: "186" }, promo)).toBe(true);
  });
});

describe("setFacets / sortCards / pushRecent", () => {
  const c = (id: string, name: string, setName: string, cardNumber: string | null): CatalogCard =>
    ({ id, name, setName, setId: null, cardNumber, imageUrl: null, lang: "en" });
  const cards = [
    c("a", "Charizard", "Base Set", "4/102"),
    c("b", "Charizard ex", "151", "199"),
    c("c", "Charizard", "Lost Origin Trainer Gallery", "TG03"),
    c("d", "Charizard V", "151", "25"),
  ];

  it("counts sets, most cards first", () => {
    expect(setFacets(cards)).toEqual([
      { name: "151", count: 2 },
      { name: "Base Set", count: 1 },
      { name: "Lost Origin Trainer Gallery", count: 1 },
    ]);
  });

  it("keeps the ranking for best match and re-orders otherwise", () => {
    expect(sortCards(cards, "best").map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
    expect(sortCards(cards, "number").map((x) => x.id)).toEqual(["c", "a", "d", "b"]);
    expect(sortCards(cards, "set").map((x) => x.id)).toEqual(["d", "b", "a", "c"]);
    expect(sortCards(cards, "name").map((x) => x.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("sorts by price either way with unpriced cards last", () => {
    const price: Record<string, number | null> = { a: 400, b: 120.5, c: null, d: 3 };
    const by = (s: "price-high" | "price-low") => sortCards(cards, s, (x) => price[x.id]).map((x) => x.id);
    expect(by("price-high")).toEqual(["a", "b", "d", "c"]);
    expect(by("price-low")).toEqual(["d", "b", "a", "c"]);
  });

  it("counts any facet, skipping blanks", () => {
    expect(facets(["Rare", null, "Common", "Rare", undefined, ""])).toEqual([
      { name: "Rare", count: 2 },
      { name: "Common", count: 1 },
    ]);
  });

  it("keeps recent searches newest first, deduped and capped", () => {
    expect(pushRecent(["mew", "pikachu"], "Pikachu")).toEqual(["Pikachu", "mew"]);
    expect(pushRecent(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
    expect(pushRecent(["a"], "   ")).toEqual(["a"]);
  });
});

describe("browse by set", () => {
  it("reads release dates, treating a placeholder later than the last update as unknown", () => {
    expect(toBrowseSet({ groupId: 1, name: "ME06: Delta Reign", abbreviation: "DLR", publishedOn: "2026-11-06T00:00:00", modifiedOn: "2026-11-11T10:00:00" }))
      .toEqual({ groupId: 1, name: "Delta Reign", code: "DLR", released: "2026-11-06" });
    expect(toBrowseSet({ groupId: 2, name: "POP Series 9", abbreviation: "POP", publishedOn: "2026-11-15T00:00:00", modifiedOn: "2026-06-18T00:00:00" }).released)
      .toBeNull();
  });
  it("lists newest first, undated sets last by name", () => {
    const s = (name: string, released: string | null) => ({ groupId: name.length, name, code: null, released });
    expect(sortSets([s("Base Set", "1999-01-09"), s("POP Series 9", null), s("Delta Reign", "2026-11-06"), s("Nintendo Promos", null)]).map((x) => x.name))
      .toEqual(["Delta Reign", "Base Set", "Nintendo Promos", "POP Series 9"]);
  });
  it("turns a product list into cards in number order, with quotes, leaving sealed out", () => {
    const group = { groupId: 23353, name: "SV: Paldean Fates", abbreviation: "PAF" };
    const card = (productId: number, name: string, number: string) =>
      ({ productId, name, extendedData: [{ name: "Number", value: number }, { name: "Rarity", value: "Promo" }] });
    const { cards, quotes } = setCardsFrom(
      [card(2, "Mew ex - 232/091", "232/091"), { productId: 9, name: "Paldean Fates Elite Trainer Box" }, card(1, "Pikachu - 027/091", "027/091")],
      [{ productId: 2, subTypeName: "Holofoil", marketPrice: 814.25, lowPrice: 700, midPrice: null, highPrice: null, directLowPrice: null }],
      group, "en",
    );
    expect(cards.map((c) => [c.id, c.name, c.cardNumber, c.setName, c.lang])).toEqual([
      ["tcgp-1", "Pikachu", "027/091", "Paldean Fates", "en"],
      ["tcgp-2", "Mew ex", "232/091", "Paldean Fates", "en"],
    ]);
    expect(quotes["tcgp-2"].market).toBe(814.25);
    expect(quotes["tcgp-1"].market).toBeNull();
  });
});

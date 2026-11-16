import { describe, expect, it } from "vitest";
import { matchesCard, nameTerm, pushRecent, rankCatalog, setFacets, sortCards, type CatalogCard, type CatalogRow } from "./catalog";

const row = (o: Partial<CatalogRow>): CatalogRow => ({
  id: "x", name: "Charizard", set_id: "sv03", set_name: "Obsidian Flames", card_number: "125", image_url: null, ...o,
});

describe("nameTerm", () => {
  it("picks the longest term with a letter", () => {
    expect(nameTerm("charizard ex 125")).toBe("charizard");
    expect(nameTerm("ex mew")).toBe("mew");
  });
  it("is null for an empty query", () => {
    expect(nameTerm("   ")).toBeNull();
  });
});

describe("rankCatalog", () => {
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
  const card = { name: "Mew ex", setName: "151", setId: "sv03.5", cardNumber: "151" };

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
});

describe("setFacets / sortCards / pushRecent", () => {
  const c = (id: string, name: string, setName: string, cardNumber: string | null): CatalogCard =>
    ({ id, name, setName, setId: null, cardNumber, imageUrl: null });
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

  it("keeps recent searches newest first, deduped and capped", () => {
    expect(pushRecent(["mew", "pikachu"], "Pikachu")).toEqual(["Pikachu", "mew"]);
    expect(pushRecent(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
    expect(pushRecent(["a"], "   ")).toEqual(["a"]);
  });
});

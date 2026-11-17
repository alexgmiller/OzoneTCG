import { describe, expect, it } from "vitest";
import { candidateGroups, closestGroups, groupCore, hiResImage, pickProduct, pickSealedProduct, printingMarket, productCardName, sealedGroups, resolveGroups, toCatalogEntry, toQuote, withSubsets, type TcgGroup, type TcgPrice, type TcgProduct } from "./tcgplayerMatch";

// Slices of TCGCSV's real group lists
const EN: TcgGroup[] = [
  { groupId: 1861, name: "SM Promos" },
  { groupId: 22872, name: "SV: Scarlet & Violet Promo Cards" },
  { groupId: 2931, name: "Celebrations: Classic Collection" },
  { groupId: 2867, name: "Celebrations" },
  { groupId: 1372, name: "Skyridge" },
  { groupId: 1938, name: "Alternate Art Promos" },
  { groupId: 1451, name: "XY Promos" },
  { groupId: 1400, name: "Delta Species" },
];
const JA: TcgGroup[] = [
  { groupId: 23645, name: "S12a: VSTAR Universe", abbreviation: "S12a" },
  { groupId: 23909, name: "SV8a: Terastal Fest ex", abbreviation: "SV8a" },
  { groupId: 23709, name: "SM12a: TAG TEAM GX: Tag All Stars", abbreviation: "SM12a" },
  { groupId: 23881, name: "SM-P: Sun & Moon Promos", abbreviation: "SM-P" },
  { groupId: 23599, name: "SV2a: Pokemon Card 151", abbreviation: "SV2a" },
  { groupId: 23724, name: "Rocket Gang" },
  { groupId: 23730, name: "Base Expansion Pack" },
  { groupId: 23721, name: "Expansion Pack" },
  { groupId: 23740, name: "Expansion Pack (No Rarity)" },
  { groupId: 23726, name: "Challenge from the Darkness" },
  { groupId: 23725, name: "Leaders' Stadium" },
  { groupId: 23727, name: "Gold, Silver, to a New World..." },
  { groupId: 23729, name: "Darkness, and to Light..." },
];

const ids = (gs: TcgGroup[]) => gs.map((g) => g.groupId);

describe("groupCore", () => {
  it("drops a set code but keeps real names with colons", () => {
    expect(groupCore("S12a: VSTAR Universe")).toBe("VSTAR Universe");
    expect(groupCore("SM-P: Sun & Moon Promos")).toBe("Sun & Moon Promos");
    expect(groupCore("Celebrations: Classic Collection")).toBe("Celebrations: Classic Collection");
  });
});

describe("resolveGroups", () => {
  it("maps English promo spellings to TCGplayer's promo groups", () => {
    expect(ids(resolveGroups("Sun & Moon Promo", EN, "en"))).toEqual([1861]);
    expect(ids(resolveGroups("Scarlet & Violet Promo", EN, "en"))).toEqual([22872]);
    expect(ids(resolveGroups("XY Promos", EN, "en"))).toEqual([1451]);
  });
  it("matches exact names before looser ones", () => {
    expect(ids(resolveGroups("Celebrations: Classic Collection", EN, "en"))).toEqual([2931]);
    expect(ids(resolveGroups("Skyridge", EN, "en"))).toEqual([1372]);
    expect(ids(resolveGroups("EX Delta Species", EN, "en"))).toEqual([1400]);
  });
  it("finds Japanese sets by name, code or word overlap", () => {
    expect(ids(resolveGroups("VSTAR Universe", JA, "ja"))).toEqual([23645]);
    expect(ids(resolveGroups("Terastal Festival ex", JA, "ja"))).toEqual([23909]);
    expect(ids(resolveGroups("Tag Team GX All Stars", JA, "ja"))).toEqual([23709]);
    expect(ids(resolveGroups("Sun & Moon Promos JP", JA, "ja"))).toEqual([23881]);
    expect(ids(resolveGroups("Pokemon 151", JA, "ja"))).toEqual([23599]);
    expect(ids(resolveGroups("Team Rocket (Japanese)", JA, "ja"))).toEqual([23724]);
    expect(ids(resolveGroups("Base Set (Japanese)", JA, "ja"))).toEqual([23721]);   // not 2001 "Base Expansion Pack"
  });
  it("finds nothing for an unknown or empty set", () => {
    expect(resolveGroups("Nonexistent Set", JA, "ja")).toEqual([]);
    expect(resolveGroups(null, EN, "en")).toEqual([]);
  });
});

const card = (productId: number, name: string, num: string | null, image = true): TcgProduct => ({
  productId, name, imageUrl: image ? `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_200w.jpg` : null,
  extendedData: [...(num ? [{ name: "Number", value: num }] : []), { name: "Rarity", value: "Promo" }],
});

describe("pickProduct", () => {
  const smp = [card(185985, "Pikachu & Zekrom GX", "SM168"), card(253397, "Pikachu & Zekrom GX - SM248", "SM248")];

  it("takes the product with the same number and a matching name", () => {
    expect(pickProduct(smp, "Pikachu & Zekrom GX", "SM248")?.productId).toBe(253397);
    expect(pickProduct([card(1, "Origin Forme Palkia VSTAR - 259/172", "259/172")], "Origin Forme Palkia VSTAR (JP)", "259/172")?.productId).toBe(1);
  });
  it("rejects a matching number with another card's name", () => {
    expect(pickProduct([card(2, "Eevee & Snorlax GX", "SM168")], "Pikachu & Zekrom GX", "SM168")).toBeNull();
  });
  it("matches unnumbered vintage Japanese cards by a unique name", () => {
    const rocket = [card(575741, "Dark Alakazam", null), card(575742, "Dark Arbok", null)];
    expect(pickProduct(rocket, "Dark Alakazam (JP)", "065")?.productId).toBe(575741);
    expect(pickProduct([...rocket, card(9, "Dark Alakazam", null)], "Dark Alakazam (JP)", "065")).toBeNull();
  });
  it("ignores sealed products", () => {
    const box: TcgProduct = { productId: 5, name: "VSTAR Universe Booster Box", imageUrl: "x", extendedData: [{ name: "Description", value: "" }] };
    expect(pickProduct([box], "VSTAR Universe Booster Box", null)).toBeNull();
  });
});

describe("hiResImage", () => {
  it("swaps the thumbnail for the 1000px image", () => {
    expect(hiResImage("https://tcgplayer-cdn.tcgplayer.com/product/185985_200w.jpg"))
      .toBe("https://tcgplayer-cdn.tcgplayer.com/product/185985_in_1000x1000.jpg");
    expect(hiResImage(null)).toBeNull();
  });
});

describe("pickProduct · SV promo numbers", () => {
  it("finds 'SVP 175' listed as 175", () => {
    expect(pickProduct([card(655095, "Espeon ex - 175", "175")], "Espeon ex - 175", "SVP 175")?.productId).toBe(655095);
  });
});

describe("vintage Japanese set names", () => {
  it("maps WotC-era English names to TCGplayer's Japanese ones", () => {
    expect(ids(resolveGroups("Gym Challenge (Japanese)", JA, "ja"))).toEqual([23726]);
    expect(ids(resolveGroups("Gym Heroes (Japanese)", JA, "ja"))).toEqual([23725]);
    expect(ids(resolveGroups("Neo Genesis (Japanese)", JA, "ja"))).toEqual([23727]);
    expect(ids(resolveGroups("Neo Destiny JP", JA, "ja"))).toEqual([23729]);
  });
});

describe("closestGroups (last resort)", () => {
  it("finds a set by its meaningful words", () => {
    expect(ids(closestGroups("Darkness to Light", JA, "ja"))).toEqual([23729]);
    expect(ids(closestGroups("VSTAR Universe Japanese", JA, "ja"))).toEqual([23645]);
  });
  it("finds nothing when no set is close", () => {
    expect(closestGroups("Totally Unrelated Name", JA, "ja")).toEqual([]);
    expect(closestGroups("Pokemon Promo", JA, "ja")).toEqual([]);
  });
});

describe("catalog set names (Search)", () => {
  const SEARCH_EN: TcgGroup[] = [
    { groupId: 1863, name: "SM Base Set" },
    { groupId: 23237, name: "SV: Scarlet & Violet 151" },
    { groupId: 1375, name: "Expedition" },
    { groupId: 2594, name: "Hidden Fates: Shiny Vault" },
    { groupId: 3064, name: "Pokemon GO" },
  ];
  it("maps TCGdex's names onto TCGplayer's", () => {
    expect(ids(resolveGroups("Sun & Moon", SEARCH_EN, "en"))).toEqual([1863]);
    expect(ids(resolveGroups("151", SEARCH_EN, "en"))).toEqual([23237]);
    expect(ids(resolveGroups("Expedition Base Set", SEARCH_EN, "en"))).toEqual([1375]);
    expect(ids(resolveGroups("Yellow A Alternate", SEARCH_EN, "en"))).toEqual([2594]);
  });
  it("ignores accents", () => {
    expect(ids(resolveGroups("Pokémon GO", SEARCH_EN, "en"))).toEqual([3064]);
  });
});

describe("sub-sets", () => {
  const G: TcgGroup[] = [
    { groupId: 2948, name: "SWSH09: Brilliant Stars" },
    { groupId: 3020, name: "SWSH09: Brilliant Stars Trainer Gallery" },
    { groupId: 17688, name: "Crown Zenith" },
    { groupId: 17689, name: "Crown Zenith: Galarian Gallery" },
    { groupId: 604, name: "Base Set" },
    { groupId: 605, name: "Base Set 2" },
    { groupId: 2867, name: "Celebrations" },
    { groupId: 2931, name: "Celebrations: Classic Collection" },
  ];
  it("looks in a set's gallery and vault groups after the set itself", () => {
    expect(ids(candidateGroups("Brilliant Stars", G, "en"))).toEqual([2948, 3020]);
    expect(ids(candidateGroups("Crown Zenith", G, "en"))).toEqual([17688, 17689]);
    expect(ids(candidateGroups("Celebrations", G, "en"))).toEqual([2867, 2931]);
  });
  it("never treats a different set as a sub-set", () => {
    expect(ids(withSubsets(resolveGroups("Base Set", G, "en"), G))).toEqual([604]);
  });
});

describe("toQuote", () => {
  const product: TcgProduct = {
    productId: 1, name: "Charizard", url: "https://www.tcgplayer.com/product/1/pokemon-charizard",
    extendedData: [{ name: "Number", value: "11/108" }, { name: "Rarity", value: "Holo Rare" }],
  };
  const price = (subTypeName: string, marketPrice: number | null, lowPrice: number | null = null, productId = 1): TcgPrice =>
    ({ productId, subTypeName, marketPrice, lowPrice, midPrice: null, highPrice: null, directLowPrice: null });

  it("lists printings primary first and prices the tile from the primary", () => {
    const q = toQuote(product, [price("Reverse Holofoil", 97.46, 69.95), price("Holofoil", 93.7, 75), price("Holofoil", 5, 1, 2)]);
    expect(q.rarity).toBe("Holo Rare");
    expect(q.market).toBe(93.7);
    expect(q.printings).toEqual([
      { name: "Holofoil", market: 93.7, low: 75 },
      { name: "Reverse Holofoil", market: 97.46, low: 69.95 },
    ]);
  });
  it("falls through to the next printing with a market price, and drops unpriced ones", () => {
    const q = toQuote(product, [price("Holofoil", null, 40), price("Reverse Holofoil", 12), price("Normal", null, null)]);
    expect(q.market).toBe(12);
    expect(q.printings.map((p) => p.name)).toEqual(["Holofoil", "Reverse Holofoil"]);
  });
  it("only keeps tcgplayer.com links", () => {
    expect(toQuote(product, []).url).toBe(product.url);
    expect(toQuote({ ...product, url: "javascript:alert(1)" }, []).url).toBeNull();
  });
});

describe("catalog rows", () => {
  it("takes the number out of TCGplayer's product names", () => {
    expect(productCardName("Bulbasaur - 001/165")).toBe("Bulbasaur");
    expect(productCardName("Bulbasaur - 001/165 (Poke Ball Pattern)")).toBe("Bulbasaur (Poke Ball Pattern)");
    expect(productCardName("Porygon-Z - 070/SM-P")).toBe("Porygon-Z");
    expect(productCardName("Pokegear 3.0 - 129/173 (Mirror Holofoil)")).toBe("Pokegear 3.0 (Mirror Holofoil)");
    expect(productCardName("Basic Fire Energy - 25")).toBe("Basic Fire Energy");
    expect(productCardName("Pheromosa & Buzzwole GX")).toBe("Pheromosa & Buzzwole GX");
  });

  const group: TcgGroup = { groupId: 23599, name: "SV2a: Pokemon Card 151", abbreviation: "SV2a" };
  const card: TcgProduct = {
    productId: 566351, name: "Charizard ex - 006/165", imageUrl: "https://tcgplayer-cdn.tcgplayer.com/product/566351_200w.jpg",
    url: "https://www.tcgplayer.com/product/566351/pokemon-japan-sv2a-charizard-ex",
    extendedData: [{ name: "Rarity", value: "Double Rare" }, { name: "Number", value: "006/165" }],
  };
  const prices: TcgPrice[] = [
    { productId: 566351, subTypeName: "Holofoil", marketPrice: 2.31, lowPrice: 1.87, midPrice: null, highPrice: null, directLowPrice: null },
  ];

  it("builds a row for a card", () => {
    expect(toCatalogEntry(card, group, "ja", prices, "T")).toEqual({
      product_id: 566351, lang: "ja", group_id: 23599, set_name: "Pokemon Card 151", set_code: "SV2a",
      name: "Charizard ex", card_number: "006/165", rarity: "Double Rare",
      image_url: "https://tcgplayer-cdn.tcgplayer.com/product/566351_in_1000x1000.jpg",
      url: card.url, market: 2.31, printings: [{ name: "Holofoil", market: 2.31, low: 1.87 }], updated_at: "T",
    });
  });
  it("leaves prices out when the price list is missing, so stored prices stay", () => {
    const row = toCatalogEntry(card, group, "ja", null, "T");
    expect(row).not.toHaveProperty("market");
    expect(row).not.toHaveProperty("printings");
  });
  it("reads TCGplayer's 'None' rarity as no rarity, and skips non-cards", () => {
    const plain = { ...card, extendedData: [{ name: "Rarity", value: "None" }, { name: "Number", value: "006/165" }] };
    expect(toCatalogEntry(plain, group, "ja", prices, "T")?.rarity).toBeNull();
    expect(toCatalogEntry({ productId: 1, name: "Booster Box" }, group, "ja", prices, "T")).toBeNull();
  });
});

describe("printingMarket", () => {
  const quote = {
    productId: 1, url: null, rarity: "Holo Rare", market: 93.7,
    printings: [{ name: "Holofoil", market: 93.7, low: 75 }, { name: "Reverse Holofoil", market: 97.46, low: 69.95 }],
  };
  it("prices the primary printing unless the item names a variant", () => {
    expect(printingMarket(quote, "Charizard")).toBe(93.7);
    expect(printingMarket(quote, "Charizard (Reverse Holo)")).toBe(97.46);
  });
  it("gives no price for a variant TCGplayer doesn't list", () => {
    expect(printingMarket(quote, "Charizard 1st Edition")).toBeNull();
  });
});

describe("sealed products", () => {
  const PE: TcgGroup = { groupId: 23821, name: "SV: Prismatic Evolutions" };
  const SS: TcgGroup = { groupId: 23651, name: "SV08: Surging Sparks" };
  const S151: TcgGroup = { groupId: 23237, name: "SV: Scarlet & Violet 151" };
  const ES: TcgGroup = { groupId: 2848, name: "SWSH07: Evolving Skies" };
  const sealed = (productId: number, name: string): TcgProduct => ({ productId, name, extendedData: [{ name: "CardText", value: "" }] });
  const PE_PRODUCTS = [
    sealed(1, "Prismatic Evolutions Elite Trainer Box"),
    sealed(2, "Prismatic Evolutions Pokemon Center Elite Trainer Box (Exclusive)"),
    sealed(3, "Prismatic Evolutions Elite Trainer Box Case"),
    sealed(4, "Prismatic Evolutions Elite Trainer Box (Dollar General Exclusive)"),
    sealed(5, "Prismatic Evolutions Mini Tin [Umbreon]"),
    sealed(6, "Prismatic Evolutions Mini Tin [Espeon]"),
    sealed(7, "Prismatic Evolutions Booster Bundle"),
    { productId: 8, name: "Umbreon ex - 161/131", extendedData: [{ name: "Number", value: "161/131" }] },
  ];
  const item = (name: string, set_name: string | null = null, product_type: string | null = null) => ({ name, set_name, product_type });
  const pick = (products: TcgProduct[], it: ReturnType<typeof item>, g: TcgGroup) => pickSealedProduct(products, it, g)?.productId ?? null;

  it("matches the exact product kind, never a case, display or exclusive", () => {
    expect(pick(PE_PRODUCTS, item("Prismatic Evolutions Elite Trainer Box"), PE)).toBe(1);
    expect(pick(PE_PRODUCTS, item("Prismatic Evolutions ETB", "Prismatic Evolutions"), PE)).toBe(1);
    expect(pick(PE_PRODUCTS, item("Prismatic Evolutions PC ETB"), PE)).toBe(2);
    expect(pick(PE_PRODUCTS, item("Prismatic Evolutions ETB Case"), PE)).toBe(3);
    expect(pick(PE_PRODUCTS, item("Sealed Prismatic Evolutions Booster Bundle"), PE)).toBe(7);
  });
  it("reads a set-only name by its product type", () => {
    expect(pick(PE_PRODUCTS, item("Prismatic Evolutions", "Prismatic Evolutions", "etb"), PE)).toBe(1);
    expect(pick(PE_PRODUCTS, item("Prismatic Evolutions", "Prismatic Evolutions", "tin"), PE)).toBeNull();
  });
  it("refuses to choose between versions", () => {
    expect(pick(PE_PRODUCTS, item("Prismatic Evolutions Mini Tin"), PE)).toBeNull();
    expect(pick(PE_PRODUCTS, item("Prismatic Evolutions Mini Tin Umbreon"), PE)).toBe(5);
    const bundles = [sealed(1, "Surging Sparks Booster Bundle (LGS)"), sealed(2, "Surging Sparks Booster Bundle (Retail)")];
    expect(pick(bundles, item("Surging Sparks Booster Bundle"), SS)).toBeNull();
  });
  it("finds the set inside the name, including plain \"151\"", () => {
    const groups = [PE, SS, S151, ES, { groupId: 1, name: "Base Set" }];
    expect(ids(sealedGroups(item("Surging Sparks Booster Box"), groups, "en"))).toEqual([23651]);
    expect(ids(sealedGroups(item("Pokemon 151 Booster Bundle"), groups, "en"))).toEqual([23237]);
    expect(ids(sealedGroups(item("Booster Box"), groups, "en"))).toEqual([]);
    expect(ids(sealedGroups(item("ETB", "Evolving Skies"), groups, "en"))).toEqual([2848]);
    expect(pick([sealed(9, "151 Booster Bundle")], item("Pokemon 151 Booster Bundle"), S151)).toBe(9);
  });
});

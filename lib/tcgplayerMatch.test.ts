import { describe, expect, it } from "vitest";
import { groupCore, hiResImage, pickProduct, resolveGroups, type TcgGroup, type TcgProduct } from "./tcgplayerMatch";

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
    expect(ids(resolveGroups("Base Set (Japanese)", JA, "ja"))).toEqual([23730]);
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

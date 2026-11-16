import { describe, expect, it } from "vitest";
import {
  artVerdict, nameLooksRight, normNum, numberKeys, parentSetId, pickByNumber, resolveSetIds, type TcgdexSet,
} from "./cardArtMatch";

// A slice of TCGdex's real English set list
const SETS: TcgdexSet[] = [
  { id: "ex11", name: "Delta Species" },
  { id: "ex15", name: "Dragon Frontiers" },
  { id: "bw8", name: "Plasma Storm" },
  { id: "bw11", name: "Legendary Treasures" },
  { id: "rc", name: "Radiant Collection" },
  { id: "xyp", name: "XY Black Star Promos" },
  { id: "sm1", name: "Sun & Moon" },
  { id: "smp", name: "SM Black Star Promos" },
  { id: "sm115", name: "Hidden Fates" },
  { id: "sma", name: "Hidden Fates Shiny Vault" },
  { id: "swsh9", name: "Brilliant Stars" },
  { id: "swsh9tg", name: "Brilliant Stars Trainer Gallery" },
  { id: "swsh12.5", name: "Crown Zenith" },
  { id: "swsh12.5gg", name: "Crown Zenith Galarian Gallery" },
  { id: "cel25", name: "Celebrations" },
  { id: "cel25cc", name: "Celebrations Classic Collection" },
  { id: "svp", name: "SVP Black Star Promos" },
  { id: "sv03.5", name: "151" },
  { id: "sv04.5", name: "Paldean Fates" },
  { id: "swsh10.5", name: "Pokémon GO" },
];

describe("normNum / numberKeys", () => {
  it("normalises prefixes, leading zeros and totals", () => {
    expect(normNum("185/165")).toBe("185");
    expect(normNum("027")).toBe("27");
    expect(normNum("TG01")).toBe("TG1");
    expect(normNum("SVP 175")).toBe("SVP175");
    expect(normNum("143a")).toBe("143A");
    expect(normNum("")).toBeNull();
  });
  it("only drops a promo prefix inside a known set", () => {
    expect(numberKeys("SVP 175", { withinSet: true })).toEqual(["SVP175", "175"]);
    expect(numberKeys("SVP 175", { withinSet: false })).toEqual(["SVP175"]);
  });
  it("never drops a TG / GG prefix (TG22 is not #022)", () => {
    expect(numberKeys("TG22/TG30", { withinSet: true })).toEqual(["TG22"]);
    expect(numberKeys("GG69/GG70", { withinSet: true })).toEqual(["GG69"]);
  });
});

describe("resolveSetIds", () => {
  const ids = (s: string) => resolveSetIds(s, SETS).sort();
  it("matches set codes and exact names", () => {
    expect(ids("sv04.5")).toEqual(["sv04.5"]);
    expect(ids("Plasma Storm")).toEqual(["bw8"]);
  });
  it("maps the promo spellings inventory uses", () => {
    expect(ids("Sun & Moon Promo")).toEqual(["smp"]);
    expect(ids("XY Promos")).toEqual(["xyp"]);
    expect(ids("Scarlet & Violet Promo")).toEqual(["svp"]);
  });
  it("drops EX / Pokemon / SV prefixes and 'Base Set'", () => {
    expect(ids("EX Delta Species")).toEqual(["ex11"]);
    expect(ids("Pokemon 151")).toEqual(["sv03.5"]);
    expect(ids("SV: 151")).toEqual(["sv03.5"]);
    expect(ids("Sun & Moon Base Set")).toEqual(["sm1"]);
  });
  it("covers both halves of 'A: B' and sub-set parents", () => {
    expect(ids("Hidden Fates: Shiny Vault")).toEqual(["sm115", "sma"]);
    expect(ids("Crown Zenith: Galarian Gallery")).toEqual(["swsh12.5", "swsh12.5gg"]);
    expect(ids("Legendary Treasures: Radiant Collections")).toEqual(["bw11", "rc"]);
    expect(ids("Brilliant Stars Trainer Gallery")).toEqual(["swsh9", "swsh9tg"]);
  });
  it("is empty for names it can't place (Japanese sets)", () => {
    expect(ids("VSTAR Universe")).toEqual([]);
    expect(ids("")).toEqual([]);
  });
  it("knows sub-set parents", () => {
    expect(parentSetId("swsh9tg")).toBe("swsh9");
    expect(parentSetId("sv03.5")).toBeNull();
  });
});

describe("nameLooksRight / pickByNumber", () => {
  it("accepts TCGdex's spellings of the same card", () => {
    expect(nameLooksRight("Jolteon (Delta Species)", "Jolteon δ")).toBe(true);
    expect(nameLooksRight("M Gengar EX", "M Gengar-EX")).toBe(true);
    expect(nameLooksRight("Jolteon (Delta Species)", "Eevee δ")).toBe(false);
  });
  it("finds the card by number, preferring one with art", () => {
    const cards = [
      { id: "smp-SM168", localId: "SM168", name: "Pikachu & Zekrom GX", image: "x" },
      { id: "smp-SM169", localId: "SM169", name: "Eevee & Snorlax GX", image: "y" },
    ];
    expect(pickByNumber(cards, "SM168")?.id).toBe("smp-SM168");
    expect(pickByNumber([{ id: "svp-027", localId: "027", name: "Pikachu" }], "27")?.id).toBe("svp-027");
    expect(pickByNumber(cards, "SM999")).toBeNull();
  });
  it("prefers the exact number over a prefix-less one", () => {
    const main = [
      { id: "swsh9-022", localId: "022", name: "Rapidash", image: "a" },
      { id: "swsh9-TG22", localId: "TG22", name: "Umbreon V", image: "b" },
    ];
    expect(pickByNumber(main, "TG22/TG30")?.id).toBe("swsh9-TG22");
  });
});

describe("artVerdict", () => {
  const v = (set: string | null, num: string | null, url: string) => artVerdict({ set_name: set, card_number: num }, url, SETS);
  const td = (set: string, num: string, lang = "en", serie = "x") => `https://assets.tcgdex.net/${lang}/${serie}/${set}/${num}/high.webp`;

  it("checks a Japanese printing by number only (its set code isn't English)", () => {
    expect(v("Pokemon 151", "185/165", td("SV2a", "185", "ja", "SV"))).toBe("unknown");
    expect(v("Pokemon 151", "185/165", td("SV2a", "006", "ja", "SV"))).toBe("wrong");
  });

  it("passes the right card", () => {
    expect(v("SV: 151", "198/165", td("sv03.5", "198"))).toBe("ok");
    expect(v("Brilliant Stars Trainer Gallery", "TG22/TG30", td("swsh9", "TG22"))).toBe("ok");
    expect(v("Scarlet & Violet Promo", "SVP 175", td("svp", "175"))).toBe("ok");
  });
  it("catches the audit's wrong images", () => {
    expect(v("Sun & Moon Promo", "SM168", td("sm9", "33"))).toBe("wrong");          // name-only guess
    expect(v("Scarlet & Violet Promo", "027", td("swsh10.5", "027"))).toBe("wrong"); // right number, wrong set
    expect(v("Celebrations: Classic Collection", "88/92", td("A1a", "032", "en", "tcgp"))).toBe("wrong"); // TCG Pocket art
    expect(v("VSTAR Universe", "259/172", td("swsh12.5", "GG67"))).toBe("wrong");  // JP card, English art
  });
  it("can't tell for other hosts or an unplaceable set with a matching number", () => {
    expect(v("Sun & Moon Promo", "SM168", "https://tcgplayer-cdn.tcgplayer.com/product/1.jpg")).toBe("unknown");
    expect(v("Alternate Art Promos", "143", td("sm12", "143"))).toBe("unknown");
  });
});

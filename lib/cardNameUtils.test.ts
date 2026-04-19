import { describe, expect, it } from "vitest";
import {
  extractEmbeddedNumber,
  isJapaneseName,
  nameVariants,
  searchBaseNames,
  stripParens,
} from "./cardNameUtils";

describe("stripParens", () => {
  it.each([
    ["Zekrom (Full art promo)", "Zekrom"],
    ["Marshadow & Machamp GX (199) (Full Art)", "Marshadow & Machamp GX"],
    ["Pikachu", "Pikachu"],
    ["  Mew ex (JP)  ", "Mew ex"],
    ["Umbreon (Master Ball Pattern)", "Umbreon"],
    ["", ""],
  ])("stripParens(%j) → %j", (input, expected) => {
    expect(stripParens(input)).toBe(expected);
  });
});

describe("isJapaneseName", () => {
  it.each<[string, boolean]>([
    ["Mew ex (JP)", true],
    ["Mew ex (jp)", true],
    ["Mew ex (Japanese)", true],
    ["Mew ex (japanese)", true],
    ["Mew ex", false],
    ["Mew ex (Full Art)", false],
    ["Jpanese Pikachu", false],
  ])("isJapaneseName(%j) → %s", (input, expected) => {
    expect(isJapaneseName(input)).toBe(expected);
  });
});

describe("extractEmbeddedNumber", () => {
  it.each<[string, string | null]>([
    ["Victini EX (131 Full Art)", "131"],
    ["Gengar (20)", "20"],
    ["Marshadow & Machamp GX (199) (Full Art)", "199"],
    ["Umbreon (Master Ball Pattern)", null],
    ["Pikachu", null],
    ["Zekrom (Full art promo)", null],
  ])("extractEmbeddedNumber(%j) → %s", (input, expected) => {
    expect(extractEmbeddedNumber(input)).toBe(expected);
  });
});

describe("searchBaseNames", () => {
  it("keeps the original name", () => {
    expect(searchBaseNames("Pikachu")).toContain("Pikachu");
  });

  it("trims surrounding whitespace", () => {
    expect(searchBaseNames("  Pikachu  ")).toContain("Pikachu");
  });

  it("adds a variant with parentheticals stripped", () => {
    const out = searchBaseNames("Zekrom (Full art promo)");
    expect(out).toContain("Zekrom (Full art promo)");
    expect(out).toContain("Zekrom");
  });

  it("strips Collectr promo notation '- 208/S-P'", () => {
    const out = searchBaseNames("Pikachu - 208/S-P");
    expect(out).toContain("Pikachu");
  });

  it("strips trailing standalone numbers '- 024'", () => {
    const out = searchBaseNames("Oricorio ex - 024");
    expect(out).toContain("Oricorio ex");
  });

  it("expands 'M ' Mega prefix", () => {
    const out = searchBaseNames("M Garchomp EX");
    expect(out).toContain("Mega Garchomp EX");
  });

  it("does not treat 'Marshadow' as a Mega prefix", () => {
    const out = searchBaseNames("Marshadow");
    expect(out).not.toContain("Megaarshadow");
    expect(out).not.toContain("Mega arshadow");
  });

  it("hyphenates EX/GX/V/VMAX/VSTAR suffixes", () => {
    expect(searchBaseNames("Alakazam EX")).toContain("Alakazam-EX");
    expect(searchBaseNames("Umbreon GX")).toContain("Umbreon-GX");
    expect(searchBaseNames("Zacian V")).toContain("Zacian-V");
    expect(searchBaseNames("Eternatus VMAX")).toContain("Eternatus-VMAX");
    expect(searchBaseNames("Arceus VSTAR")).toContain("Arceus-VSTAR");
  });

  it("combines Mega expansion with hyphenation", () => {
    const out = searchBaseNames("M Garchomp EX");
    expect(out).toContain("Mega Garchomp-EX");
  });

  it("handles 'Raichu delta species' → 'Raichu δ'", () => {
    const out = searchBaseNames("Raichu delta species");
    expect(out).toContain("Raichu δ");
    expect(out).toContain("Raichu");
  });

  it("handles Collectr parenthetical 'Jolteon (Delta Species)'", () => {
    const out = searchBaseNames("Jolteon (Delta Species)");
    expect(out).toContain("Jolteon δ");
    expect(out).toContain("Jolteon");
  });

  it("does not emit empty strings", () => {
    const out = searchBaseNames("(only parens)");
    for (const n of out) expect(n.length).toBeGreaterThan(0);
  });

  it("deduplicates identical candidates", () => {
    const out = searchBaseNames("Pikachu");
    expect(new Set(out).size).toBe(out.length);
  });
});

describe("nameVariants", () => {
  it("includes the original name", () => {
    expect(nameVariants("mew ex")).toContain("mew ex");
  });

  it("includes a first-letter-capitalized variant", () => {
    expect(nameVariants("mew ex")).toContain("Mew ex");
  });

  it("includes a title-case variant", () => {
    expect(nameVariants("mew ex")).toContain("Mew Ex");
  });

  it("deduplicates when input is already title-cased", () => {
    const out = nameVariants("Mew Ex");
    expect(new Set(out).size).toBe(out.length);
  });
});

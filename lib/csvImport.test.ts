import { describe, expect, it } from "vitest";
import {
  detectIdx,
  inferCategory,
  inferCondition,
  inferGrade,
  parseCSVLine,
  parseCSVText,
  parsePrice,
  roundMarketPrice,
} from "./csvImport";

describe("parseCSVLine", () => {
  it("splits a plain row on commas and trims cells", () => {
    expect(parseCSVLine("Charizard, Base Set , 4/102")).toEqual([
      "Charizard",
      "Base Set",
      "4/102",
    ]);
  });

  it("keeps commas that sit inside quoted fields", () => {
    expect(parseCSVLine('"Charizard, Base Set",NM,$100')).toEqual([
      "Charizard, Base Set",
      "NM",
      "$100",
    ]);
  });

  it("preserves empty cells so column indices stay aligned", () => {
    expect(parseCSVLine("a,,c")).toEqual(["a", "", "c"]);
    expect(parseCSVLine(",,")).toEqual(["", "", ""]);
  });

  it("returns a single empty cell for an empty line", () => {
    expect(parseCSVLine("")).toEqual([""]);
  });

  it("handles a trailing comma as a final empty cell", () => {
    expect(parseCSVLine("a,b,")).toEqual(["a", "b", ""]);
  });
});

describe("parseCSVText", () => {
  it("separates the header row from data rows", () => {
    const { headers, rows } = parseCSVText("name,price\nPikachu,10\nMew,20");
    expect(headers).toEqual(["name", "price"]);
    expect(rows).toEqual([
      ["Pikachu", "10"],
      ["Mew", "20"],
    ]);
  });

  it("normalises CRLF and CR line endings", () => {
    expect(parseCSVText("name,price\r\nPikachu,10").rows).toEqual([["Pikachu", "10"]]);
    expect(parseCSVText("name,price\rPikachu,10").rows).toEqual([["Pikachu", "10"]]);
  });

  it("drops blank rows", () => {
    const { rows } = parseCSVText("name,price\nPikachu,10\n,\n\nMew,20");
    expect(rows).toEqual([
      ["Pikachu", "10"],
      ["Mew", "20"],
    ]);
  });

  it("returns nothing when there is a header but no data", () => {
    expect(parseCSVText("name,price")).toEqual({ headers: [], rows: [] });
    expect(parseCSVText("")).toEqual({ headers: [], rows: [] });
  });
});

describe("detectIdx", () => {
  it("matches a header exactly, ignoring case and punctuation", () => {
    expect(detectIdx(["Card Name", "Market Price"], ["marketprice"])).toBe(1);
    expect(detectIdx(["card_name"], ["cardname"])).toBe(0);
  });

  it("matches a header that contains the candidate as a substring", () => {
    expect(detectIdx(["TCG Market Price"], ["marketprice"])).toBe(0);
  });

  it("honours candidate order, not header order", () => {
    // "cost" is listed first, so it wins even though "market" appears earlier.
    expect(detectIdx(["Market", "Cost"], ["cost", "market"])).toBe(1);
  });

  it("returns -1 when no candidate matches", () => {
    expect(detectIdx(["Foo", "Bar"], ["name", "price"])).toBe(-1);
    expect(detectIdx([], ["name"])).toBe(-1);
  });
});

describe("inferCondition", () => {
  it.each([
    ["NM", "Near Mint"],
    ["Near Mint", "Near Mint"],
    ["mint", "Near Mint"],
    ["LP", "Lightly Played"],
    ["Lightly Played", "Lightly Played"],
    ["MP", "Moderately Played"],
    ["Moderately Played", "Moderately Played"],
    ["HP", "Heavily Played"],
    ["Heavily Played", "Heavily Played"],
    ["DMG", "Damaged"],
    ["Damaged", "Damaged"],
  ])("maps %j → %j", (input, expected) => {
    expect(inferCondition(input)).toBe(expected);
  });

  it("defaults to Near Mint for unknown or empty values", () => {
    expect(inferCondition("")).toBe("Near Mint");
    expect(inferCondition("who knows")).toBe("Near Mint");
  });

  it("does not silently upgrade a played card to Near Mint", () => {
    // Regression: matching on "heavy" missed "Heavily Played" (heavi-ly), so
    // the worst-condition cards fell through to the Near Mint default.
    for (const raw of ["Heavily Played", "heavily played", "HEAVILY PLAYED"]) {
      expect(inferCondition(raw)).not.toBe("Near Mint");
      expect(inferCondition(raw)).toBe("Heavily Played");
    }
  });
});

describe("parsePrice", () => {
  it("strips currency symbols and separators", () => {
    expect(parsePrice("$100")).toBe(100);
    expect(parsePrice("$1,250.50")).toBe(1250.5);
    expect(parsePrice("  12.99  ")).toBe(12.99);
  });

  it("returns null for empty, zero or non-numeric cells", () => {
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("$0")).toBeNull();
    expect(parsePrice("N/A")).toBeNull();
    expect(parsePrice("--")).toBeNull();
  });
});

describe("inferGrade", () => {
  it("normalises grading company and numeric grade", () => {
    expect(inferGrade("PSA 10")).toBe("PSA 10");
    expect(inferGrade("psa 9")).toBe("PSA 9");
    expect(inferGrade("BGS 9.5")).toBe("BGS 9.5");
    expect(inferGrade("cgc 8.5")).toBe("CGC 8.5");
  });

  it("strips trailing zeros from the grade number", () => {
    expect(inferGrade("PSA 10.0")).toBe("PSA 10");
  });

  it("returns null for ungraded or empty values", () => {
    expect(inferGrade("")).toBeNull();
    expect(inferGrade("Ungraded")).toBeNull();
    expect(inferGrade("ungraded raw")).toBeNull();
  });

  it("passes through an unrecognised non-empty grade unchanged", () => {
    expect(inferGrade("Authentic")).toBe("Authentic");
  });
});

describe("roundMarketPrice", () => {
  it("applies a $3 floor to cheap cards", () => {
    expect(roundMarketPrice(0.1)).toBe(3);
    expect(roundMarketPrice(2.99)).toBe(3);
  });

  it("rounds up to the next dollar below $100", () => {
    expect(roundMarketPrice(12.01)).toBe(13);
    expect(roundMarketPrice(99.5)).toBe(100);
  });

  it("rounds up to the next $5 between $100 and $500", () => {
    expect(roundMarketPrice(101)).toBe(105);
    expect(roundMarketPrice(250)).toBe(250);
  });

  it("rounds up to the next $10 at $500 and above", () => {
    expect(roundMarketPrice(501)).toBe(510);
    expect(roundMarketPrice(1234)).toBe(1240);
  });

  it("never rounds a price down", () => {
    for (const p of [3, 47.2, 100, 137, 500, 892.5]) {
      expect(roundMarketPrice(p)).toBeGreaterThanOrEqual(p);
    }
  });
});

describe("inferCategory", () => {
  it("classifies graded cards as slabs", () => {
    expect(inferCategory("PSA 10")).toBe("slab");
    expect(inferCategory("", "", "", "BGS 9.5")).toBe("slab");
    expect(inferCategory("graded")).toBe("slab");
  });

  it("classifies sealed product from name hints", () => {
    expect(inferCategory("", "Booster Box")).toBe("sealed");
    expect(inferCategory("", "Elite Trainer Box ETB")).toBe("sealed");
    expect(inferCategory("sealed")).toBe("sealed");
    expect(inferCategory("", "Charizard Tin")).toBe("sealed");
  });

  it("defaults to single for ordinary cards", () => {
    expect(inferCategory("")).toBe("single");
    expect(inferCategory("Card", "Pikachu", "NM", "")).toBe("single");
  });

  it("prefers slab over sealed when both signals are present", () => {
    // A graded card shipped in a box is still a slab.
    expect(inferCategory("", "PSA 10 Charizard", "", "")).toBe("slab");
  });
});

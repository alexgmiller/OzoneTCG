import { describe, expect, it } from "vitest";
import { parseTerms, scoreLocalCard, type ScoredCard } from "./cardSearchScoring";

function card(overrides: Partial<ScoredCard> = {}): ScoredCard {
  return { name: "charizard", set_name: "base set", card_number: "4", ...overrides };
}

/** Score a card the way callers do: parse the query, then score against it. */
function score(c: ScoredCard, query: string): number {
  const q = query.toLowerCase();
  return scoreLocalCard(c, parseTerms(q), q);
}

describe("parseTerms", () => {
  it("lowercases and splits on whitespace", () => {
    expect(parseTerms("Charizard Base")).toEqual(["charizard", "base"]);
  });

  it("treats punctuation as a separator", () => {
    expect(parseTerms("Farfetch'd")).toEqual(["farfetch", "d"]);
    expect(parseTerms("Alakazam-EX")).toEqual(["alakazam", "ex"]);
    expect(parseTerms("Mew, Mewtwo")).toEqual(["mew", "mewtwo"]);
  });

  it("collapses repeated whitespace", () => {
    expect(parseTerms("  charizard    base  ")).toEqual(["charizard", "base"]);
  });

  it("returns an empty list for blank input", () => {
    expect(parseTerms("")).toEqual([]);
    expect(parseTerms("   ")).toEqual([]);
  });
});

describe("scoreLocalCard — ranking", () => {
  it("scores an exact name match highest", () => {
    const exact = score(card({ name: "charizard" }), "charizard");
    const prefix = score(card({ name: "charizard vmax" }), "charizard");
    expect(exact).toBeGreaterThan(prefix);
  });

  it("ranks a prefix match above a mid-string match", () => {
    const prefix = score(card({ name: "charizard vmax" }), "charizard");
    const contains = score(card({ name: "dark charizard" }), "charizard");
    expect(prefix).toBeGreaterThan(contains);
  });

  it("gives a non-zero score to a substring hit", () => {
    expect(score(card({ name: "dark charizard" }), "charizard")).toBeGreaterThan(0);
  });

  it("returns zero when nothing matches", () => {
    expect(score(card({ name: "blastoise", set_name: "base set", card_number: "2" }), "pikachu")).toBe(0);
  });

  it("ranks a name match above a set-name-only match", () => {
    const byName = score(card({ name: "jungle scyther", set_name: "base set" }), "jungle");
    const bySet = score(card({ name: "pidgeot", set_name: "jungle" }), "jungle");
    expect(byName).toBeGreaterThan(bySet);
  });
});

describe("scoreLocalCard — card numbers", () => {
  it("rewards an exact card-number match", () => {
    const hit = score(card({ name: "charizard", card_number: "4" }), "charizard 4");
    const miss = score(card({ name: "charizard", card_number: "99" }), "charizard 4");
    expect(hit).toBeGreaterThan(miss);
  });

  it("ignores leading zeros when matching numbers", () => {
    const padded = score(card({ name: "charizard", card_number: "4" }), "charizard 004");
    const plain = score(card({ name: "charizard", card_number: "4" }), "charizard 4");
    expect(padded).toBe(plain);
  });

  it("gives partial credit for a numeric prefix match", () => {
    const prefix = score(card({ name: "charizard", card_number: "150" }), "charizard 15");
    const unrelated = score(card({ name: "charizard", card_number: "999" }), "charizard 15");
    expect(prefix).toBeGreaterThan(unrelated);
  });

  it("does not crash on cards missing a number", () => {
    expect(() => score(card({ card_number: null }), "charizard 4")).not.toThrow();
  });
});

describe("scoreLocalCard — field fallbacks", () => {
  it("falls back to set_id when set_name is absent", () => {
    const c: ScoredCard = { name: "pidgeot", set_name: null, set_id: "jungle", card_number: "24" };
    expect(score(c, "jungle")).toBeGreaterThan(0);
  });

  it("handles every optional field being null", () => {
    const c: ScoredCard = { name: "charizard", set_name: null, card_number: null };
    expect(score(c, "charizard")).toBeGreaterThan(0);
  });
});

describe("scoreLocalCard — realistic ordering", () => {
  it("ranks a full result set the way a user would expect", () => {
    const candidates: ScoredCard[] = [
      { name: "dark charizard", set_name: "team rocket", card_number: "4" },
      { name: "charizard", set_name: "base set", card_number: "4" },
      { name: "charizard vmax", set_name: "champions path", card_number: "20" },
      { name: "blastoise", set_name: "base set", card_number: "2" },
    ];
    const ranked = candidates
      .map((c) => ({ name: c.name, s: score(c, "charizard") }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.name);

    expect(ranked[0]).toBe("charizard");
    expect(ranked).not.toContain("blastoise");
    expect(ranked).toContain("dark charizard");
  });

  it("uses the card number to disambiguate same-named cards", () => {
    const base = { name: "charizard", set_name: "base set" };
    const ranked = [
      { ...base, card_number: "11" },
      { ...base, card_number: "4" },
    ]
      .map((c) => ({ num: c.card_number, s: score(c, "charizard 4") }))
      .sort((a, b) => b.s - a.s);
    expect(ranked[0].num).toBe("4");
  });
});

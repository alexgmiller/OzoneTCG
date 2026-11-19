import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PokeInvestGraded, PokeInvestPrices } from "./pokeinvest";
import {
  answerMatches, cardDue, gradeMatches, pickSearchHit, refreshPokeInvestCards, searchQuery, slabCardKey,
  slabPokeInvestPrice, splitName, type PokeInvestCardRow,
} from "./pokeinvestSlabs";

vi.mock("./tcgplayerPrices", () => ({
  lookupTcgplayerQuotes: vi.fn(async (cards: { key: string; name: string }[]) =>
    Object.fromEntries(cards.filter((c) => c.name.startsWith("Espeon")).map((c) => [c.key, { productId: 250000 }]))),
}));

function g(grader: string, grade: string, median: number | null, sales = 10, windowDays = 90): PokeInvestGraded {
  return { grader, grade, median_usd: median, sales, window_days: windowDays, low_usd: null, high_usd: null, change_vs_previous_window: null };
}

function row(graded: PokeInvestGraded[], overrides: Partial<PokeInvestCardRow> = {}): PokeInvestCardRow {
  return {
    card_key: "espeon vmax (alternate art secret)|fusion strike|270", pokeinvest_id: "pi_13869", tcgplayer_id: "250000",
    matched_by: "tcgplayer", name: "Espeon VMAX #270", set_name: "Fusion Strike", page_url: "https://www.pokeinvest.io/card/x",
    ungraded: null, graded, fetched_at: "2026-11-18T10:30:00.000Z", checked_at: "2026-11-18T10:30:00.000Z", ...overrides,
  };
}

describe("slabCardKey", () => {
  it("is the card part of the slab_prices key", () => {
    expect(slabCardKey("Espeon VMAX", "Fusion Strike", "270/264")).toBe("espeon vmax|fusion strike|270");
    expect(slabCardKey("Umbreon GX", null, null)).toBe("umbreon gx||");
  });
});

describe("gradeMatches", () => {
  it("matches the grader and the number", () => {
    expect(gradeMatches("PSA", "10", { grader: "PSA", grade: "10" })).toBe(true);
    expect(gradeMatches("PSA", "10", { grader: "PSA", grade: "9" })).toBe(false);
    expect(gradeMatches("PSA", "10", { grader: "CGC", grade: "10" })).toBe(false);
    expect(gradeMatches("CGC", "9.5", { grader: "CGC", grade: "9.5" })).toBe(true);
    expect(gradeMatches("BECKETT", "9.5", { grader: "BGS", grade: "9.5" })).toBe(true);
  });
  it("keeps the top labels apart", () => {
    expect(gradeMatches("CGC", "10", { grader: "CGC", grade: "Pristine 10" })).toBe(false);
    expect(gradeMatches("CGC", "Pristine 10", { grader: "CGC", grade: "Pristine 10" })).toBe(true);
    expect(gradeMatches("BGS", "10", { grader: "BGS", grade: "Black Label 10" })).toBe(false);
    // At BGS "Pristine 10" is the plain 10
    expect(gradeMatches("BGS", "10 Pristine", { grader: "BGS", grade: "10" })).toBe(true);
  });
  it("ignores graders PokeInvest doesn't price", () => {
    expect(gradeMatches("XYZ", "10", { grader: "XYZ", grade: "10" })).toBe(false);
  });
});

describe("slabPokeInvestPrice", () => {
  it("prices a slab from its grade", () => {
    expect(slabPokeInvestPrice(row([g("PSA", "9", 300), g("PSA", "10", 650, 17)]), "PSA 10")).toEqual({
      median: 650, sales: 17, windowDays: 90, grade: "PSA 10",
      pageUrl: "https://www.pokeinvest.io/card/x", fetchedAt: "2026-11-18T10:30:00.000Z",
    });
  });
  it("needs 3 sales inside a year", () => {
    expect(slabPokeInvestPrice(row([g("PSA", "10", 650, 2)]), "PSA 10")).toBeNull();
    expect(slabPokeInvestPrice(row([g("PSA", "10", 650, 3, 1095)]), "PSA 10")).toBeNull();
    expect(slabPokeInvestPrice(row([g("PSA", "10", null, 5)]), "PSA 10")).toBeNull();
    expect(slabPokeInvestPrice(row([g("PSA", "10", 650, 3, 365)]), "PSA 10")?.median).toBe(650);
  });
  it("gives nothing for an unmatched card, a missing grade or an unreadable one", () => {
    expect(slabPokeInvestPrice(row([g("PSA", "10", 650)], { pokeinvest_id: null }), "PSA 10")).toBeNull();
    expect(slabPokeInvestPrice(row([g("PSA", "9", 300)]), "PSA 10")).toBeNull();
    expect(slabPokeInvestPrice(row([g("PSA", "10", 650)]), null)).toBeNull();
    expect(slabPokeInvestPrice(row([g("PSA", "10", 650)]), "10")).toBeNull();
    expect(slabPokeInvestPrice(undefined, "PSA 10")).toBeNull();
  });
  it("prefers the same label when two prices share a number", () => {
    const r = row([g("BGS", "10", 900), g("BGS", "Pristine 10", 1200)]);
    expect(slabPokeInvestPrice(r, "BGS 10")?.median).toBe(900);
    expect(slabPokeInvestPrice(r, "BGS 10 Pristine")?.median).toBe(1200);
  });
});

describe("matching a slab to PokeInvest's card", () => {
  it("splits PokeInvest names into name and number", () => {
    expect(splitName("Psyduck #286/SM-P")).toEqual({ name: "Psyduck", number: "286/SM-P" });
    expect(splitName("Umbreon GX #SV69")).toEqual({ name: "Umbreon GX", number: "SV69" });
    expect(splitName("Mew")).toEqual({ name: "Mew", number: null });
  });

  it("accepts the same number and leading name, whatever the extra words", () => {
    expect(answerMatches("Espeon VMAX #270", { name: "Espeon VMAX (Alternate Art Secret)", set_name: "Fusion Strike", card_number: "270/264" })).toBe(true);
    expect(answerMatches("Pikachu with Grey Felt Hat #085", { name: "Pikachu with Grey Felt Hat", set_name: null, card_number: "085" })).toBe(true);
    expect(answerMatches("Origin Forme Dialga VSTAR #260", { name: "Origin Forme Dialga VSTAR (JP)", set_name: null, card_number: "260/172" })).toBe(true);
    expect(answerMatches("Umbreon GX #SV69", { name: "Umbreon GX", set_name: "Hidden Fates", card_number: "SV69/SV94" })).toBe(true);
  });

  it("rejects a different number or a different card", () => {
    expect(answerMatches("Espeon VMAX #271", { name: "Espeon VMAX", set_name: null, card_number: "270" })).toBe(false);
    expect(answerMatches("Umbreon VMAX #270", { name: "Espeon VMAX", set_name: null, card_number: "270" })).toBe(false);
    expect(answerMatches("Espeon VMAX", { name: "Espeon VMAX", set_name: null, card_number: "270" })).toBe(false);
    expect(answerMatches("Espeon VMAX #270", { name: "Espeon VMAX", set_name: null, card_number: null })).toBe(false);
  });

  it("lets the set decide between two printings with the same number, or picks nothing", () => {
    const hits = [
      { id: "pi_1", name: "Charizard #4", set: "Pokemon Base Set 2" },
      { id: "pi_2", name: "Charizard #4", set: "Pokemon Base Set" },
      { id: "pi_3", name: "Charmander #4", set: "Pokemon Base Set" },
    ];
    expect(pickSearchHit(hits, { name: "Charizard", set_name: "Base Set", card_number: "4/102" })?.id).toBe("pi_2");
    expect(pickSearchHit(hits, { name: "Charizard", set_name: "Base Set 2", card_number: "4/130" })?.id).toBe("pi_1");
    expect(pickSearchHit(hits.slice(0, 2), { name: "Charizard", set_name: null, card_number: "4" })).toBeNull();
    expect(pickSearchHit(hits, { name: "Blastoise", set_name: "Base Set", card_number: "2" })).toBeNull();
  });

  it("searches by name and number, leaving out notes and the set label", () => {
    expect(searchQuery({ name: "Lillie (Full Art)", set_name: "Sun & Moon Base Set", card_number: "147/149" })).toBe("Lillie 147");
    expect(searchQuery({ name: "Venusaur ex", set_name: "SV: 151", card_number: "198/165" })).toBe("Venusaur ex 198");
  });
});

describe("cardDue", () => {
  const now = new Date("2026-11-20T00:00:00Z").getTime();
  it("matches new cards and retries misses weekly", () => {
    expect(cardDue(undefined, now)).toBe("match");
    expect(cardDue(row([], { pokeinvest_id: null, checked_at: "2026-11-18T00:00:00Z" }), now)).toBeNull();
    expect(cardDue(row([], { pokeinvest_id: null, checked_at: "2026-11-12T00:00:00Z" }), now)).toBe("match");
  });
  it("refetches prices every 3 days", () => {
    expect(cardDue(row([], { fetched_at: "2026-11-18T00:00:00Z" }), now)).toBeNull();
    expect(cardDue(row([], { fetched_at: "2026-11-16T00:00:00Z" }), now)).toBe("refetch");
    expect(cardDue(row([], { fetched_at: "2026-11-19T00:00:00Z" }), now, 86_400_000)).toBe("refetch");
  });
});

// ── The nightly refresh, against a fake table and a fake API ──

function fakeAdmin(initial: PokeInvestCardRow[] = [], selectError: unknown = null) {
  const saved: PokeInvestCardRow[] = [];
  const admin = {
    from: () => ({
      select: () => ({ in: async () => ({ data: selectError ? null : initial, error: selectError }) }),
      upsert: async (r: PokeInvestCardRow) => { saved.push(r); return { error: null }; },
    }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: admin as any, saved };
}

function prices(id: string, name: string, graded: PokeInvestGraded[]): PokeInvestPrices {
  return { pokeinvest_id: id, tcgplayer_id: null, name, set_name: "Set", page_url: `https://www.pokeinvest.io/card/${id}`, currency: "USD", ungraded: null, graded };
}

const ESPEON = { name: "Espeon VMAX (Alternate Art Secret)", set_name: "Fusion Strike", card_number: "270/264", language: null };
const UMBREON = { name: "Umbreon GX", set_name: "Hidden Fates", card_number: "SV69/SV94", language: null };

describe("refreshPokeInvestCards", () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => vi.unstubAllGlobals());

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it("matches by TCGplayer product, falls back to search, and saves both", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/prices/250000")) return json(200, prices("pi_13869", "Espeon VMAX #270", [g("PSA", "10", 650, 17)]));
      if (url.includes("/api/search")) return json(200, { cards: [{ id: "pi_16011", name: "Umbreon GX #SV69", number: null, set: "Hidden Fates" }], query: "Umbreon GX SV69" });
      if (url.endsWith("/api/prices/pi_16011")) return json(200, prices("pi_16011", "Umbreon GX #SV69", [g("PSA", "10", 700, 1)]));
      return json(404, {});
    });
    const { admin, saved } = fakeAdmin();
    const { rows, stats } = await refreshPokeInvestCards(admin, [ESPEON, UMBREON, ESPEON], { key: "k", now: new Date("2026-11-20T00:00:00Z") });

    expect(stats).toMatchObject({ cards: 2, fetched: 2, matchedTcgplayer: 1, matchedSearch: 1, unmatched: 0, calls: 2, stopped: null });
    expect(saved.map((r) => [r.pokeinvest_id, r.matched_by])).toEqual([["pi_13869", "tcgplayer"], ["pi_16011", "search"]]);
    const espeon = rows.get(slabCardKey(ESPEON.name, ESPEON.set_name, ESPEON.card_number));
    expect(slabPokeInvestPrice(espeon, "PSA 10")?.median).toBe(650);
    // Umbreon is matched, but one sale isn't enough to price it
    expect(slabPokeInvestPrice(rows.get(slabCardKey(UMBREON.name, UMBREON.set_name, UMBREON.card_number)), "PSA 10")).toBeNull();
    // Every call sends the key
    const priceCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes("/api/prices/"));
    expect(priceCalls.every(([, init]) => init.headers["X-API-Key"] === "k")).toBe(true);
  });

  it("records a miss when PokeInvest's card isn't the slab's", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/api/prices/250000") ? json(200, prices("pi_9", "Espeon V #12", [])) : json(200, { cards: [], query: "" }));
    const { admin, saved } = fakeAdmin();
    const { stats } = await refreshPokeInvestCards(admin, [ESPEON], { key: "k" });
    expect(stats).toMatchObject({ unmatched: 1, fetched: 0 });
    expect(saved[0]).toMatchObject({ pokeinvest_id: null, tcgplayer_id: "250000" });
  });

  it("refetches stale cards by their PokeInvest ID and leaves fresh ones alone", async () => {
    fetchMock.mockImplementation(async () => json(200, prices("pi_13869", "Espeon VMAX #270", [g("PSA", "10", 640, 18)])));
    const key = slabCardKey(ESPEON.name, ESPEON.set_name, ESPEON.card_number);
    const stale = row([g("PSA", "10", 650, 17)], { card_key: key, fetched_at: "2026-11-10T00:00:00Z" });
    const { admin, saved } = fakeAdmin([stale]);
    const { stats } = await refreshPokeInvestCards(admin, [ESPEON], { key: "k", now: new Date("2026-11-20T00:00:00Z") });
    expect(fetchMock.mock.calls[0][0]).toBe("https://www.pokeinvest.io/api/prices/pi_13869");
    expect(stats.fetched).toBe(1);
    expect(saved[0].graded[0].median_usd).toBe(640);

    fetchMock.mockClear();
    const fresh = row([], { card_key: key, fetched_at: "2026-11-19T00:00:00Z" });
    await refreshPokeInvestCards(fakeAdmin([fresh]).admin, [ESPEON], { key: "k", now: new Date("2026-11-20T00:00:00Z") });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops at the call limit and on a used-up month", async () => {
    fetchMock.mockImplementation(async () => json(429, {}));
    const { stats } = await refreshPokeInvestCards(fakeAdmin().admin, [ESPEON, UMBREON], { key: "k" });
    expect(stats.stopped).toBe("monthly calls used up (429)");
    expect(stats.calls).toBe(1);

    fetchMock.mockImplementation(async (url: string) => (url.includes("/api/search") ? json(200, { cards: [], query: "" }) : json(404, {})));
    const limited = await refreshPokeInvestCards(fakeAdmin().admin, [ESPEON, UMBREON], { key: "k", maxCalls: 1 });
    expect(limited.stats.calls).toBe(1);
  });

  it("does nothing without the table or the key", async () => {
    const missing = await refreshPokeInvestCards(fakeAdmin([], { code: "42P01" }).admin, [ESPEON], { key: "k" });
    expect(missing.tableMissing).toBe(true);
    const noKey = await refreshPokeInvestCards(fakeAdmin().admin, [ESPEON], { key: undefined });
    expect(noKey.stats.stopped).toBe("no POKEINVEST_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

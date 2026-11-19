import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PokeInvestPrice, PokeInvestPrices } from "./pokeinvest";
import { pokeinvestRawFor, rawPokeInvestPrice, slabCardKey, type PokeInvestCardRow } from "./pokeinvestSlabs";

vi.mock("./tcgplayerPrices", () => ({ lookupTcgplayerQuotes: vi.fn(async () => ({})) }));

const u = (median: number | null, sales: number, windowDays = 90): PokeInvestPrice =>
  ({ median_usd: median, sales, window_days: windowDays, low_usd: null, high_usd: null, change_vs_previous_window: null });

describe("rawPokeInvestPrice", () => {
  it("takes a trusted ungraded median", () => {
    expect(rawPokeInvestPrice({ pokeinvest_id: "pi_27304", ungraded: u(1424.95, 46) })).toBe(1424.95);
  });
  it("needs 3 sales in a year, a match and a price", () => {
    expect(rawPokeInvestPrice({ pokeinvest_id: "pi_1", ungraded: u(100, 2) })).toBeNull();
    expect(rawPokeInvestPrice({ pokeinvest_id: "pi_1", ungraded: u(100, 5, 1095) })).toBeNull();
    expect(rawPokeInvestPrice({ pokeinvest_id: "pi_1", ungraded: u(null, 5) })).toBeNull();
    expect(rawPokeInvestPrice({ pokeinvest_id: null, ungraded: u(100, 5) })).toBeNull();
    expect(rawPokeInvestPrice({ pokeinvest_id: "pi_1", ungraded: null })).toBeNull();
    expect(rawPokeInvestPrice(undefined)).toBeNull();
  });
});

describe("pokeinvestRawFor", () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => vi.unstubAllGlobals());

  const PSYDUCK = { name: "Psyduck (JP)", set_name: "Japanese Promo", card_number: "286/SM-P", language: "ja" };
  const admin = (rows: PokeInvestCardRow[]) => ({
    from: () => ({
      select: (_c: string, o?: { head?: boolean }) => o?.head
        ? { or: async () => ({ count: 0, error: null }) }
        : { in: async () => ({ data: rows, error: null }) },
      upsert: async () => ({ error: null }),
    }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  it("matches the card by search and returns its raw sold median", async () => {
    const body: PokeInvestPrices = {
      pokeinvest_id: "pi_27304", tcgplayer_id: "598363", name: "Psyduck #286/SM-P", set_name: "Japanese Promo",
      page_url: "https://www.pokeinvest.io/card/japanese-promo/psyduck-286sm-p", currency: "USD", ungraded: u(1424.95, 46), graded: [],
    };
    fetchMock.mockImplementation(async (url: string) => url.includes("/api/search")
      ? new Response(JSON.stringify([{ id: "pi_27304", name: "Psyduck #286/SM-P", set: "Japanese Promo" }]))
      : new Response(JSON.stringify(body)));
    expect(await pokeinvestRawFor(admin([]), PSYDUCK, "k")).toBe(1424.95);
  });

  it("reads a fresh cached row without a call", async () => {
    const row: PokeInvestCardRow = {
      card_key: slabCardKey(PSYDUCK.name, PSYDUCK.set_name, PSYDUCK.card_number), pokeinvest_id: "pi_27304", tcgplayer_id: null,
      matched_by: "search", name: null, set_name: null, page_url: null, ungraded: u(1400, 40), graded: [],
      fetched_at: new Date().toISOString(), checked_at: new Date().toISOString(),
    };
    expect(await pokeinvestRawFor(admin([row]), PSYDUCK, "k")).toBe(1400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

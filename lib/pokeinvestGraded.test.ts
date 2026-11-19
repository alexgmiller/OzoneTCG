import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PokeInvestGraded, PokeInvestPrices } from "./pokeinvest";
import { gradeRows, gradedPricesFor } from "./pokeinvestGraded";
import { DAILY_CALLS, slabCardKey, type PokeInvestCardRow } from "./pokeinvestSlabs";

vi.mock("./tcgplayerPrices", () => ({ lookupTcgplayerQuotes: vi.fn(async () => ({})) }));

function g(grader: string, grade: string, median: number | null, sales = 10, windowDays = 90): PokeInvestGraded {
  return { grader, grade, median_usd: median, sales, window_days: windowDays, low_usd: null, high_usd: null, change_vs_previous_window: null };
}

function fakeAdmin(initial: PokeInvestCardRow[] = [], usedToday = 0) {
  const admin = {
    from: () => ({
      select: (_cols: string, opts?: { head?: boolean }) => opts?.head
        ? { or: async () => ({ count: usedToday, error: null }) }
        : { in: async () => ({ data: initial, error: null }) },
      upsert: async () => ({ error: null }),
    }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return admin as any;
}

const UMBREON = { name: "Umbreon GX", set_name: "Hidden Fates", card_number: "SV69/SV94", language: null };
const KEY = slabCardKey(UMBREON.name, UMBREON.set_name, UMBREON.card_number);

describe("gradeRows", () => {
  it("keeps trusted grades, PSA first and best grade first", () => {
    const { grades, raw } = gradeRows({
      ungraded: { median_usd: 300, sales: 40, window_days: 90, low_usd: null, high_usd: null, change_vs_previous_window: null },
      graded: [
        g("CGC", "10", 500), g("PSA", "9", 400), g("BGS", "Black Label 10", 2000, 3, 365),
        g("PSA", "10", 1300), g("CGC", "Pristine 10", 900), g("PSA", "8", 350, 2), g("SGC", "10", null),
      ],
    });
    expect(grades.map((r) => `${r.grader} ${r.grade}`)).toEqual(["PSA 10", "PSA 9", "CGC Pristine 10", "CGC 10", "BGS Black Label 10"]);
    expect(raw).toMatchObject({ median: 300, sales: 40 });
  });

  it("leaves out a thin raw price", () => {
    expect(gradeRows({ graded: [], ungraded: { median_usd: 50, sales: 1, window_days: 1095, low_usd: null, high_usd: null, change_vs_previous_window: null } }).raw).toBeNull();
  });
});

describe("gradedPricesFor", () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => vi.unstubAllGlobals());
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  const prices = (graded: PokeInvestGraded[]): PokeInvestPrices => ({
    pokeinvest_id: "pi_16011", tcgplayer_id: "16011", name: "Umbreon GX #SV69", set_name: "Hidden Fates",
    page_url: "https://www.pokeinvest.io/card/x", currency: "USD", ungraded: null, graded,
  });

  it("fetches by the TCGplayer product and lists the grades", async () => {
    fetchMock.mockImplementation(async () => json(200, prices([g("PSA", "9", 400), g("PSA", "10", 1300)])));
    const r = await gradedPricesFor(fakeAdmin(), UMBREON, { key: "k", productId: 16011 });
    expect(fetchMock.mock.calls[0][0]).toBe("https://www.pokeinvest.io/api/prices/16011");
    expect(r).toMatchObject({ status: "ok", pageUrl: "https://www.pokeinvest.io/card/x" });
    expect(r.status === "ok" && r.grades.map((x) => x.grade)).toEqual(["10", "9"]);
  });

  it("answers from a fresh cached row without a call", async () => {
    const row: PokeInvestCardRow = {
      card_key: KEY, pokeinvest_id: "pi_16011", tcgplayer_id: "16011", matched_by: "tcgplayer", name: "Umbreon GX #SV69",
      set_name: "Hidden Fates", page_url: null, ungraded: null, graded: [g("PSA", "10", 1300)],
      fetched_at: new Date().toISOString(), checked_at: new Date().toISOString(),
    };
    const r = await gradedPricesFor(fakeAdmin([row]), UMBREON, { key: "k", productId: 16011 });
    expect(r.status).toBe("ok");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says none for a card with no trusted sales or a known miss", async () => {
    fetchMock.mockImplementation(async () => json(200, prices([g("PSA", "10", 1300, 1)])));
    expect((await gradedPricesFor(fakeAdmin(), UMBREON, { key: "k", productId: 16011 })).status).toBe("none");

    const miss: PokeInvestCardRow = {
      card_key: KEY, pokeinvest_id: null, tcgplayer_id: null, matched_by: null, name: null, set_name: null, page_url: null,
      ungraded: null, graded: [], fetched_at: null, checked_at: new Date().toISOString(),
    };
    fetchMock.mockClear();
    expect((await gradedPricesFor(fakeAdmin([miss]), UMBREON, { key: "k", productId: null })).status).toBe("none");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the free search's PSA 10 when today's calls are used up", async () => {
    fetchMock.mockImplementation(async (url: string) => url.includes("/api/search")
      ? json(200, [{ id: "pi_16011", name: "Umbreon GX #SV69", set: "Hidden Fates", psa_10_usd: 1250, ungraded_usd: 300, page_url: "https://www.pokeinvest.io/card/x" }])
      : json(500, {}));
    const r = await gradedPricesFor(fakeAdmin([], DAILY_CALLS), UMBREON, { key: "k", productId: 16011 });
    expect(r).toEqual({ status: "quick", psa10: 1250, raw: 300, pageUrl: "https://www.pokeinvest.io/card/x" });
    expect(fetchMock.mock.calls.every(([u]) => String(u).includes("/api/search"))).toBe(true);
  });

  it("uses the free search without a key too, and says none when it finds nothing", async () => {
    fetchMock.mockImplementation(async () => json(200, []));
    expect((await gradedPricesFor(fakeAdmin(), UMBREON, { key: undefined, productId: null })).status).toBe("none");
  });
});

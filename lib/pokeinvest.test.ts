import { afterEach, describe, expect, it, vi } from "vitest";
import { checkPokeInvest, pokeinvestPricesUrl, summarizePrices, type PokeInvestPrices } from "./pokeinvest";

const PSYDUCK = { tcgPlayerId: 598363, pokeinvestId: "pi_27304" };

function prices(overrides: Partial<PokeInvestPrices> = {}): PokeInvestPrices {
  return {
    pokeinvest_id: "pi_27304",
    tcgplayer_id: "598363",
    name: "Psyduck #286/SM-P",
    set_name: "Japanese Promo",
    page_url: "https://www.pokeinvest.io/card/japanese-promo/psyduck-286sm-p",
    currency: "USD",
    ungraded: { median_usd: 1424.95, low_usd: 1200, high_usd: 1700, sales: 12, window_days: 90, change_vs_previous_window: null },
    graded: [
      { grader: "PSA", grade: "10", median_usd: 11700, low_usd: null, high_usd: null, sales: 5, window_days: 365, change_vs_previous_window: null },
      { grader: "PSA", grade: "9", median_usd: null, low_usd: null, high_usd: null, sales: 1, window_days: 365, change_vs_previous_window: null },
    ],
    ...overrides,
  };
}

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("pokeinvestPricesUrl", () => {
  it("takes a TCGplayer ID or a PokeInvest ID", () => {
    expect(pokeinvestPricesUrl(598363)).toBe("https://www.pokeinvest.io/api/prices/598363");
    expect(pokeinvestPricesUrl("pi_27304")).toBe("https://www.pokeinvest.io/api/prices/pi_27304");
  });
});

describe("summarizePrices", () => {
  it("writes one line per price, and says when a grade has too few sales", () => {
    expect(summarizePrices(prices())).toEqual({
      card: "Psyduck #286/SM-P · Japanese Promo",
      ungraded: "$1,424.95, median of 12 sales in 90 days",
      graded: ["PSA 10: $11,700, median of 5 sales in 365 days", "PSA 9: no price (1 sale)"],
    });
  });

  it("handles a card with no ungraded sales and caps a long grade list", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ ...prices().graded[0], grade: String(i) }));
    const s = summarizePrices(prices({ ungraded: null, graded: many }), 12);
    expect(s.ungraded).toBe("no ungraded sales");
    expect(s.graded).toHaveLength(13);
    expect(s.graded.at(-1)).toBe("…3 more grades");
  });
});

describe("checkPokeInvest", () => {
  it("reports no key without calling the API", async () => {
    vi.stubEnv("POKEINVEST_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkPokeInvest(PSYDUCK)).toEqual({ configured: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("looks the card up by TCGplayer ID with the key in X-API-Key", async () => {
    vi.stubEnv("POKEINVEST_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(respond(200, prices(), { "x-ratelimit-remaining": "998", "content-type": "application/json" }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await checkPokeInvest(PSYDUCK);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://www.pokeinvest.io/api/prices/598363");
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ "X-API-Key": "test-key" });
    expect(r).toMatchObject({ configured: true, ok: true, status: 200, foundBy: "tcgplayer", rightCard: true, limits: { "x-ratelimit-remaining": "998" } });
    expect(r.summary?.ungraded).toBe("$1,424.95, median of 12 sales in 90 days");
  });

  it("falls back to the PokeInvest ID when the TCGplayer ID isn't linked", async () => {
    vi.stubEnv("POKEINVEST_API_KEY", "test-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(404, { error: "card not found" }))
      .mockResolvedValueOnce(respond(200, prices()));
    vi.stubGlobal("fetch", fetchMock);
    const r = await checkPokeInvest(PSYDUCK);
    expect(fetchMock.mock.calls[1][0]).toBe("https://www.pokeinvest.io/api/prices/pi_27304");
    expect(r).toMatchObject({ ok: true, foundBy: "pokeinvest", rightCard: true });
  });

  it("flags an answer for a different card", async () => {
    vi.stubEnv("POKEINVEST_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, prices({ pokeinvest_id: "pi_1" }))));
    expect((await checkPokeInvest(PSYDUCK)).rightCard).toBe(false);
  });

  it("explains a rejected key and a used-up month", async () => {
    vi.stubEnv("POKEINVEST_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(401, { error: "bad key" })));
    expect(await checkPokeInvest(PSYDUCK)).toMatchObject({ ok: false, status: 401, error: expect.stringContaining("POKEINVEST_API_KEY") });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(429, "Too many")));
    expect(await checkPokeInvest(PSYDUCK)).toMatchObject({ ok: false, status: 429, error: expect.stringContaining("reset on the 1st") });
  });

  it("reports a network failure instead of throwing", async () => {
    vi.stubEnv("POKEINVEST_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await checkPokeInvest(PSYDUCK)).toEqual({ configured: true, ok: false, error: "timeout" });
  });
});

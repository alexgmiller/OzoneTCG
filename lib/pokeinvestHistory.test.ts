import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backfillRows, backfillSlabHistory, parseHistory, seriesFor, stepValue, type GradeHistory } from "./pokeinvestHistory";
import { DAILY_CALLS, slabCardKey } from "./pokeinvestSlabs";

const pt = (date: string, price_usd: number, sales = 5) => ({ date, price_usd, sales, basis: "median", window_days: 90 });

describe("parseHistory", () => {
  it("keeps each grade's points oldest first and drops thin or broken ones", () => {
    const h = parseHistory({
      grades: {
        "PSA 10": [pt("2026-11-09", 650), pt("2025-01-05", 369.99, 1), pt("2025-02-01", 570), { date: "bad", price_usd: 1, sales: 9 }],
        "PSA 9": [pt("2025-03-01", 0)],
        "CGC 10": "nope",
      },
    });
    expect(h).toEqual({ "PSA 10": [{ date: "2025-02-01", price: 570 }, { date: "2026-11-09", price: 650 }] });
  });
  it("gives null for an answer without grades", () => {
    expect(parseHistory({ error: "api key not recognised" })).toBeNull();
    expect(parseHistory("text")).toBeNull();
  });
});

describe("seriesFor", () => {
  const h: GradeHistory = {
    "PSA 10": [{ date: "2025-01-01", price: 600 }],
    "CGC Pristine 10": [{ date: "2025-01-01", price: 900 }],
    "CGC 10": [{ date: "2025-01-01", price: 500 }],
  };
  it("finds the slab's grade, keeping the top labels apart", () => {
    expect(seriesFor(h, "PSA 10")[0].price).toBe(600);
    expect(seriesFor(h, "CGC 10")[0].price).toBe(500);
    expect(seriesFor(h, "CGC Pristine 10")[0].price).toBe(900);
    expect(seriesFor(h, "PSA 9")).toEqual([]);
    expect(seriesFor(null, "PSA 10")).toEqual([]);
    expect(seriesFor(h, null)).toEqual([]);
  });
});

describe("stepValue and backfillRows", () => {
  const series = [{ date: "2025-01-10", price: 500 }, { date: "2026-10-01", price: 700 }, { date: "2026-11-09", price: 650 }];
  it("reads the price in force on a date", () => {
    expect(stepValue(series, "2025-01-09")).toBeNull();
    expect(stepValue(series, "2025-06-01")).toBe(500);
    expect(stepValue(series, "2026-11-17")).toBe(650);
  });
  it("writes the change points and rewrites earlier nightly dates, never today or later", () => {
    const rows = backfillRows({ id: "i1", workspace_id: "w1" }, series, ["2026-11-16", "2026-11-17", "2026-11-19"], "2026-11-19");
    expect(rows.map((r) => [r.date, r.market])).toEqual([
      ["2025-01-10", 500], ["2026-10-01", 700], ["2026-11-09", 650], ["2026-11-16", 650], ["2026-11-17", 650],
    ]);
    expect(rows.every((r) => r.item_id === "i1" && r.workspace_id === "w1")).toBe(true);
  });
});

// ── The nightly back-fill, against fake tables ──

type Card = { card_key: string; pokeinvest_id: string | null; history: GradeHistory | null; history_at: string | null };

function fakeAdmin(cards: Card[], existing: Record<string, string[]>, opts: { usedToday?: number; columnsMissing?: boolean } = {}) {
  const updates: { key: string; patch: Record<string, unknown> }[] = [];
  const written: { item_id: string; date: string; market: number }[] = [];
  const admin = {
    from: (table: string) => {
      if (table === "pokeinvest_cards") {
        return {
          select: (_c: string, o?: { head?: boolean }) => o?.head
            ? { or: async () => ({ count: opts.usedToday ?? 0, error: null }) }
            : { in: async () => (opts.columnsMissing ? { data: null, error: { code: "42703" } } : { data: cards, error: null }) },
          update: (patch: Record<string, unknown>) => ({ eq: async (_k: string, key: string) => { updates.push({ key, patch }); return { error: null }; } }),
        };
      }
      return {
        select: () => {
          let id = "";
          const q = { eq: (_k: string, v: string) => { id = v; return q; }, lt: () => q, order: async () => ({ data: (existing[id] ?? []).map((date) => ({ date })), error: null }) };
          return q;
        },
        upsert: async (rows: { item_id: string; date: string; market: number }[]) => { written.push(...rows); return { error: null }; },
      };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: admin as any, updates, written };
}

const ESPEON = { id: "i1", workspace_id: "w1", name: "Espeon VMAX", set_name: "Fusion Strike", card_number: "270/264", grade: "PSA 10" };
const KEY = slabCardKey(ESPEON.name, ESPEON.set_name, ESPEON.card_number);
const NOW = new Date("2026-11-19T02:30:00Z");

describe("backfillSlabHistory", () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => vi.unstubAllGlobals());

  it("fetches a card's history once and back-fills its slab", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ grades: { "PSA 10": [pt("2025-02-01", 570), pt("2026-11-09", 650)] } })));
    const { admin, updates, written } = fakeAdmin([{ card_key: KEY, pokeinvest_id: "pi_13869", history: null, history_at: null }], { i1: ["2026-11-17"] });
    const stats = await backfillSlabHistory(admin, [ESPEON], { key: "k", now: NOW });

    expect(fetchMock.mock.calls[0][0]).toBe("https://www.pokeinvest.io/api/price-history/pi_13869");
    expect(updates[0]).toMatchObject({ key: KEY, patch: { history_at: NOW.toISOString(), checked_at: NOW.toISOString() } });
    expect(written.map((r) => [r.date, r.market])).toEqual([["2025-02-01", 570], ["2026-11-09", 650], ["2026-11-17", 650]]);
    expect(stats).toEqual({ fetched: 1, filled: 1, points: 3, stopped: null });
  });

  it("uses stored history without a call, and skips a slab already back-filled", async () => {
    const card = { card_key: KEY, pokeinvest_id: "pi_13869", history: { "PSA 10": [{ date: "2025-02-01", price: 570 }] }, history_at: "2026-11-18T02:30:00Z" };
    const fresh = fakeAdmin([card], { i1: [] });
    expect((await backfillSlabHistory(fresh.admin, [ESPEON], { key: "k", now: NOW })).filled).toBe(1);
    const done = fakeAdmin([card], { i1: ["2025-02-01", "2026-11-17"] });
    expect((await backfillSlabHistory(done.admin, [ESPEON], { key: "k", now: NOW })).filled).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks a card whose history is unusable so it isn't asked again", async () => {
    fetchMock.mockResolvedValue(new Response("oops", { status: 500 }));
    const { admin, updates, written } = fakeAdmin([{ card_key: KEY, pokeinvest_id: "pi_13869", history: null, history_at: null }], {});
    await backfillSlabHistory(admin, [ESPEON], { key: "k", now: NOW });
    expect(updates[0].patch).toMatchObject({ history: {} });
    expect(written).toEqual([]);
  });

  it("keeps to the daily limit and stops without the columns or the key", async () => {
    const card = { card_key: KEY, pokeinvest_id: "pi_13869", history: null, history_at: null };
    expect((await backfillSlabHistory(fakeAdmin([card], {}, { usedToday: DAILY_CALLS }).admin, [ESPEON], { key: "k", now: NOW })).stopped).toBe("call limit");
    expect((await backfillSlabHistory(fakeAdmin([card], {}, { columnsMissing: true }).admin, [ESPEON], { key: "k", now: NOW })).stopped).toMatch(/migrations/);
    expect((await backfillSlabHistory(fakeAdmin([card], {}).admin, [ESPEON], { key: undefined, now: NOW })).stopped).toBe("no POKEINVEST_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

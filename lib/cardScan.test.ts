import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { identifyImage, parseCandidates, pickCatalogCard, scanLang, toScanMatches } from "./cardScan";

const cand = (id: string, name: string, set: string, extra: Record<string, unknown> = {}) =>
  ({ id, name, set, image: null, page_url: `https://www.pokeinvest.io/card/${id}`, confidence: "likely", similarity: 0.9, psa_10_usd: 650, ungraded_usd: 280, ...extra });

describe("parseCandidates", () => {
  it("keeps well-formed matches once each, in order", () => {
    expect(parseCandidates({ candidates: [cand("pi_1", "Espeon VMAX #270", "Fusion Strike"), cand("pi_1", "dup", "x"), { name: "no id" }, cand("pi_2", "Espeon VMAX #169", "Chinese CS4aC")] })
      .map((c) => c.id)).toEqual(["pi_1", "pi_2"]);
    expect(parseCandidates({ error: "x" })).toEqual([]);
    expect(parseCandidates(null)).toEqual([]);
  });
});

describe("scanLang", () => {
  it("sends Japanese sets to the Japanese catalog and leaves out ones we don't carry", () => {
    expect(scanLang("Fusion Strike")).toBe("en");
    expect(scanLang("Japanese VSTAR Universe")).toBe("ja");
    expect(scanLang("Japanese Promo")).toBe("ja");
    expect(scanLang("Chinese CS4aC")).toBeNull();
    expect(scanLang("Korean Promo")).toBeNull();
  });
});

describe("pickCatalogCard", () => {
  const cards = [
    { name: "Espeon VMAX", setName: "Fusion Strike", cardNumber: "270/264" },
    { name: "Espeon VMAX", setName: "Fusion Strike", cardNumber: "065/264" },
    { name: "Umbreon VMAX", setName: "Evolving Skies", cardNumber: "270/203" },
  ];
  it("takes the card with the same number and name", () => {
    expect(pickCatalogCard(cards, { name: "Espeon VMAX #270", set: "Fusion Strike" })).toBe(cards[0]);
  });
  it("finds nothing when the number or name differs", () => {
    expect(pickCatalogCard(cards, { name: "Espeon VMAX #271", set: "Fusion Strike" })).toBeNull();
    expect(pickCatalogCard(cards, { name: "Espeon VMAX", set: "Fusion Strike" })).toBeNull();
  });
  it("lets the set decide between printings that share a number", () => {
    const twins = [
      { name: "Charizard", setName: "Base Set 2", cardNumber: "4/130" },
      { name: "Charizard", setName: "Base Set", cardNumber: "4/102" },
    ];
    expect(pickCatalogCard(twins, { name: "Charizard #4", set: "Pokemon Base Set" })).toBe(twins[1]);
  });
});

describe("toScanMatches", () => {
  it("looks each match up in the right catalog and keeps the top three", async () => {
    const search = vi.fn(async (q: string, lang: "en" | "ja") => lang === "en"
      ? [{ name: "Espeon VMAX", setName: "Fusion Strike", cardNumber: "270/264", id: "swsh8-270" }]
      : [{ name: "Espeon VMAX", setName: "Promo Cards", cardNumber: "189/S-P", id: "tcgp-1" }]);
    const matches = await toScanMatches([
      cand("pi_13869", "Espeon VMAX #270", "Fusion Strike"),
      cand("pi_2", "Espeon VMAX #169", "Chinese CS4aC"),
      cand("pi_3", "Espeon VMAX #189/S-P", "Japanese Promo"),
      cand("pi_4", "Espeon V #64", "Fusion Strike"),
    ], search);
    expect(matches).toHaveLength(3);
    expect(search).toHaveBeenCalledWith("Espeon VMAX 270", "en");
    expect(search).toHaveBeenCalledWith("Espeon VMAX 189", "ja");
    expect(matches[0]).toMatchObject({ pokeinvestId: "pi_13869", name: "Espeon VMAX", number: "270", lang: "en", psa10: 650, raw: 280 });
    expect(matches[0].card?.id).toBe("swsh8-270");
    expect(matches[1]).toMatchObject({ lang: null, card: null });
    expect(matches[2].card?.id).toBe("tcgp-1");
  });
});

describe("identifyImage", () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => vi.unstubAllGlobals());
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  const photo = new Blob(["jpeg"], { type: "image/jpeg" });

  it("uses the free scan when it answers", async () => {
    fetchMock.mockResolvedValue(json(200, { candidates: [cand("pi_1", "Espeon VMAX #270", "Fusion Strike")] }));
    const useKey = vi.fn(async () => true);
    const r = await identifyImage(photo, { key: "k", useKey });
    expect(r).toMatchObject({ status: "ok", via: "free" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers).toEqual({});
    expect(useKey).not.toHaveBeenCalled();
  });

  it("spends a key call only when the free scans are used up and one is allowed", async () => {
    fetchMock.mockResolvedValueOnce(json(429, {})).mockResolvedValueOnce(json(200, { candidates: [cand("pi_1", "Espeon VMAX #270", "x")] }));
    const r = await identifyImage(photo, { key: "k", useKey: async () => true });
    expect(r).toMatchObject({ status: "ok", via: "key" });
    expect(fetchMock.mock.calls[1][1].headers).toEqual({ "X-API-Key": "k" });

    fetchMock.mockReset().mockImplementation(async () => json(429, {}));
    expect(await identifyImage(photo, { key: "k", useKey: async () => false })).toEqual({ status: "limit" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await identifyImage(photo, { key: undefined, useKey: async () => true })).toEqual({ status: "limit" });
  });

  it("reports the scanner being offline, a bad photo and network trouble", async () => {
    fetchMock.mockImplementation(async () => json(503, {}));
    expect(await identifyImage(photo, { key: "k", useKey: async () => true })).toEqual({ status: "offline" });
    fetchMock.mockImplementation(async () => json(400, { error: "no image" }));
    expect((await identifyImage(photo, { key: "k", useKey: async () => true })).status).toBe("error");
    fetchMock.mockRejectedValue(new Error("timeout"));
    expect(await identifyImage(photo, { key: "k", useKey: async () => true })).toEqual({ status: "error", message: "timeout" });
  });
});

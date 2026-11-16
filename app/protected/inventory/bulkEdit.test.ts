import { describe, it, expect } from "vitest";
import { blankBulkForm, buildPatches, mixed, roundSticker, stickerFor, summarize, undoPatches } from "./bulkEdit";
import type { Item } from "./types";

const item = (over: Partial<Item>): Item => ({
  id: "x", name: "Card", category: "single", owner: "shared", status: "inventory",
  market: 100, cost: 60, condition: "Near Mint", notes: null, created_at: "2026-10-01T00:00:00Z",
  consigner_id: null, image_url: null, set_name: null, card_number: null, grade: null, cert_number: null,
  cost_basis: null, buy_percentage: null, acquisition_type: null, chain_depth: 0,
  original_cash_invested: null, sticker_price: null, acquired_market_price: null, acquired_date: null,
  product_type: null, quantity: 1, language: "english",
  ...over,
});
const fmv = (it: Item) => it.market;

describe("mixed", () => {
  it("is false for one item or identical values, true when they differ", () => {
    expect(mixed([item({})], (i) => i.owner)).toBe(false);
    expect(mixed([item({ owner: "alex" }), item({ owner: "alex" })], (i) => i.owner)).toBe(false);
    expect(mixed([item({ owner: "alex" }), item({ owner: "mila" })], (i) => i.owner)).toBe(true);
  });
});

describe("sticker modes", () => {
  it("rounds to none / $1 / $5", () => {
    expect(roundSticker(12.345, "none")).toBe(12.35);
    expect(roundSticker(12.5, "1")).toBe(13);
    expect(roundSticker(12.5, "5")).toBe(15);
    expect(roundSticker(12.4, "5")).toBe(10);
  });
  it("set / % of FMV / +- delta", () => {
    const it1 = item({ market: 80, sticker_price: 90 });
    expect(stickerFor(it1, 80, { mode: "set", value: "50", roundTo: "none" })).toBe(50);
    expect(stickerFor(it1, 80, { mode: "pct", value: "125", roundTo: "1" })).toBe(100);
    expect(stickerFor(it1, 80, { mode: "delta", value: "-10", roundTo: "none" })).toBe(80);
  });
  it("delta falls back to FMV when there is no sticker, and null with neither", () => {
    expect(stickerFor(item({ market: 40, sticker_price: null }), 40, { mode: "delta", value: "5", roundTo: "none" })).toBe(45);
    expect(stickerFor(item({ market: null, sticker_price: null }), null, { mode: "delta", value: "5", roundTo: "none" })).toBeNull();
    expect(stickerFor(item({}), null, { mode: "pct", value: "50", roundTo: "none" })).toBeNull();
  });
});

describe("buildPatches", () => {
  const items = [item({ id: "a", notes: "old" }), item({ id: "b", category: "slab", owner: "consigner", consigner_id: "c1" })];

  it("emits nothing for an untouched form", () => {
    expect(buildPatches(items, blankBulkForm(), fmv)).toEqual([]);
  });
  it("owner → OzoneTCG keeps paid-by, clears consigner", () => {
    const p = buildPatches(items, { ...blankBulkForm(), owner: "ozone" }, fmv);
    expect(p.find((x) => x.id === "a")!.patch).toEqual({ owner: "shared", consigner_id: null });
    expect(p.find((x) => x.id === "b")!.patch).toEqual({ owner: "shared", consigner_id: null });
  });
  it("owner → consigner id", () => {
    const p = buildPatches(items, { ...blankBulkForm(), owner: "c9" }, fmv);
    expect(p[0].patch).toEqual({ owner: "consigner", consigner_id: "c9" });
  });
  it("paid-by alone only touches non-consigned items", () => {
    const p = buildPatches(items, { ...blankBulkForm(), paidBy: "alex" }, fmv);
    expect(p).toEqual([{ id: "a", patch: { owner: "alex" } }]);
  });
  it("condition applies to raw singles only; notes append", () => {
    const p = buildPatches(items, { ...blankBulkForm(), condition: "Lightly Played", notesAppend: "show pickup" }, fmv);
    expect(p.find((x) => x.id === "a")!.patch).toEqual({ condition: "Lightly Played", notes: "old\nshow pickup" });
    expect(p.find((x) => x.id === "b")!.patch).toEqual({ notes: "show pickup" });
  });
  it("sticker per item from FMV", () => {
    const p = buildPatches(items, { ...blankBulkForm(), sticker: { mode: "pct", value: "150", roundTo: "5" } }, fmv);
    expect(p.every((x) => x.patch.sticker_price === 150)).toBe(true);
  });
});

describe("summarize + undo", () => {
  it("names the touched fields", () => {
    expect(summarize({ ...blankBulkForm(), owner: "ozone", sticker: { mode: "set", value: "1", roundTo: "none" } }, 3)).toBe("Update 3 items: sticker price, owner");
    expect(summarize(blankBulkForm(), 1)).toBe("Update 1 item");
  });
  it("inverts applied patches from the prior values", () => {
    const items = [item({ id: "a", sticker_price: 12, notes: "n" })];
    const undo = undoPatches(items, [{ id: "a", patch: { sticker_price: 20, notes: "n\nx" } }]);
    expect(undo).toEqual([{ id: "a", patch: { sticker_price: 12, notes: "n" } }]);
  });
});

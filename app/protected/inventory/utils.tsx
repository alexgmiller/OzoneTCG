"use client";

import { makeSlabPriceKey, parseGrade } from "@/lib/ebay-client";
import { makeRawCardPriceKey, priceForCondition } from "@/lib/justtcg";
import type { FMVResult } from "@/lib/fmv";
import type { SlabPrice, RawCardPrice } from "./InventoryServer";
import type { Condition, Item, ItemForm } from "./types";

// ── Numbers ──
export function toNum(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function fmt(v: number | null) {
  if (v == null) return "-";
  return `$${v.toFixed(2)}`;
}

export function nullLast(a: number | null, b: number | null, asc: boolean): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return asc ? a - b : b - a;
}

// Effective cost: prefer cost_basis (trade chain cash invested) over manual cost.
export function effectiveCost(it: { cost: number | null; cost_basis: number | null }): number | null {
  if (it.cost_basis != null) return it.cost_basis;
  if (it.cost != null) return it.cost;
  return null;
}

export function getMovement(current: number | null, acquired: number | null): number | null {
  if (current == null || acquired == null || acquired === 0) return null;
  return ((current - acquired) / acquired) * 100;
}

export function MovementBadge({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const abs = Math.abs(pct);
  if (pct > 10) return <span className="text-xs font-semibold text-positive tabular-nums whitespace-nowrap">▲ +{abs.toFixed(0)}%</span>;
  if (pct < -10) return <span className="text-xs font-semibold text-negative tabular-nums whitespace-nowrap">▼ -{abs.toFixed(0)}%</span>;
  return <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">— {pct >= 0 ? "+" : ""}{pct.toFixed(0)}%</span>;
}

// ── Price lookups ──
export function slabKeyFor(it: Item): string | null {
  if (it.category !== "slab" || !it.grade) return null;
  const parsed = parseGrade(it.grade);
  return parsed ? makeSlabPriceKey(it.name, it.set_name, it.card_number, parsed.company, parsed.grade) : null;
}

export function rawConditionPrice(rcp: RawCardPrice | null | undefined, condition: Condition | null): number | null {
  if (!rcp) return null;
  return priceForCondition({ nm: rcp.nm_price, lp: rcp.lp_price, mp: rcp.mp_price, hp: rcp.hp_price, dmg: rcp.dmg_price }, condition);
}

// Market price shown for an item: slab FMV, TCGPlayer condition price, or the saved market.
export function itemMarketPrice(
  it: Item,
  slabFMVData: Record<string, FMVResult>,
  rawCardPrices: Record<string, RawCardPrice>,
): number | null {
  if (it.category === "slab" && it.grade) return slabFMVData[it.id]?.fmv ?? it.market;
  if (it.category === "sealed") return it.market;
  const rcp = rawCardPrices[makeRawCardPriceKey(it.name, it.set_name, it.card_number)];
  return rawConditionPrice(rcp, it.condition) ?? it.market;
}

// ── Labels ──
const PRODUCT_TYPE_LABELS: Record<string, string> = {
  booster_box: "Booster Box",
  etb: "ETB",
  tin: "Tin",
  collection_box: "Collection Box",
  bundle: "Bundle",
  booster_pack: "Booster Pack",
  promo_box: "Promo Box",
  other: "Sealed",
};

export function sealedTypeLabel(productType: string | null): string {
  if (!productType) return "Sealed";
  return PRODUCT_TYPE_LABELS[productType] ?? productType;
}

const CONDITION_SHORT: Record<string, string> = {
  "Near Mint": "NM", "Lightly Played": "LP", "Moderately Played": "MP", "Heavily Played": "HP", "Damaged": "Dmg",
};

export function conditionShort(condition: Condition | null): string {
  if (!condition) return "";
  return CONDITION_SHORT[condition] ?? condition;
}

export function statusLabel(it: Item): string {
  if (it.status === "sold") return "Sold";
  if (it.owner === "consigner") return "Consigned";
  if (it.status === "grading") return "Grading";
  return "Inventory";
}

export function setLine(it: { set_name: string | null; card_number: string | null }): string {
  return [it.set_name, it.card_number ? `#${it.card_number}` : ""].filter(Boolean).join(" · ");
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ── eBay / TCGPlayer search links ──
function cleanCardName(name: string) {
  return name.replace(/\b(JP|JPN|EN|ENG|Japanese|English)\b\s*/gi, "").trim();
}

export function buildSlabEbayQuery(name: string, grade: string | null, setName: string | null, cardNumber: string | null): string {
  const num = cardNumber?.split("/")[0]?.trim() ?? "";
  return [grade, cleanCardName(name), setName, num].filter(Boolean).join(" ");
}

export function buildRawEbayQuery(name: string, setName: string | null, cardNumber: string | null): string {
  const num = cardNumber?.split("/")[0]?.trim() ?? "";
  return [cleanCardName(name), setName, num].filter(Boolean).join(" ");
}

export function ebayQueryFor(it: Item): string {
  if (it.category === "slab") return buildSlabEbayQuery(it.name, it.grade, it.set_name, it.card_number);
  if (it.category === "sealed") return [it.name, it.set_name].filter(Boolean).join(" ");
  return buildRawEbayQuery(it.name, it.set_name, it.card_number);
}

export function tcgQueryFor(it: Item): string {
  return [cleanCardName(it.name), it.set_name].filter(Boolean).join(" ");
}

export function ebayLinks(it: Item) {
  const q = encodeURIComponent(ebayQueryFor(it));
  return {
    sold: `https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Complete=1&LH_Sold=1&_sacat=183454`,
    listed: `https://www.ebay.com/sch/i.html?_nkw=${q}&_sacat=183454`,
    tcg: `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(tcgQueryFor(it))}&view=grid`,
  };
}

// ── Staleness tiers ──
const TIER_2H = 2 * 60 * 60 * 1000;
const TIER_4H = 4 * 60 * 60 * 1000;
const TIER_8H = 8 * 60 * 60 * 1000;
export const EBAY_DAILY_BUDGET = 5000;
export const EBAY_BUDGET_WARN_PCT = 0.8;

export function getSlabTierMs(fmv: number | null, compCount: number): number {
  if (compCount < 3) return TIER_2H;       // low confidence → 2h
  if (fmv == null)   return TIER_2H;       // no data → treat as 2h (will be highest priority)
  if (fmv > 200)     return TIER_2H;       // high value → 2h
  if (fmv >= 50)     return TIER_4H;       // medium value → 4h
  return TIER_8H;                          // low value → 8h
}

export function isSlabTierStale(sp: SlabPrice | null | undefined, fmv: number | null): boolean {
  if (!sp?.last_updated) return true;      // no cached data at all
  const compCount = sp.sold_count > 0 ? sp.sold_count : sp.comp_count;
  return Date.now() - new Date(sp.last_updated).getTime() > getSlabTierMs(fmv, compCount);
}

// ── Forms ──
export const blankForm = (): ItemForm => ({
  category: "single",
  owner: "shared",
  status: "inventory",
  name: "",
  condition: "Near Mint",
  cost: "",
  market: "",
  buyPct: "",
  notes: "",
  consignerId: "",
  imageUrl: "",
  cardId: "",
  setName: "",
  cardNumber: "",
  grade: "",
  stickerPrice: "",
  productType: "",
  quantity: "1",
  language: "english",
});

// Form → DB row
export function formToInput(f: ItemForm) {
  return {
    category: f.category,
    owner: f.owner,
    status: f.status,
    name: f.name,
    condition: f.category === "single" ? f.condition : "Near Mint" as const,
    cost: toNum(f.cost),
    market: toNum(f.market),
    notes: f.notes || null,
    consigner_id: f.consignerId || null,
    image_url: f.imageUrl || null,
    set_name: f.setName || null,
    card_number: f.cardNumber || null,
    grade: f.grade || null,
    sticker_price: toNum(f.stickerPrice),
    product_type: f.category === "sealed" ? (f.productType || null) : null,
    quantity: f.category === "sealed" ? (parseInt(f.quantity) || 1) : 1,
    language: f.category === "sealed" ? (f.language || "english") : "english",
  };
}

export function itemToForm(it: Item): ItemForm {
  return {
    category: it.category,
    owner: it.owner,
    status: it.status,
    name: it.name,
    condition: it.condition,
    cost: it.cost != null ? String(it.cost) : "",
    market: it.market != null ? String(it.market) : "",
    buyPct: it.buy_percentage != null ? String(it.buy_percentage) : "",
    notes: it.notes ?? "",
    consignerId: it.consigner_id ?? "",
    imageUrl: it.image_url ?? "",
    cardId: "",
    setName: it.set_name ?? "",
    cardNumber: it.card_number ?? "",
    grade: it.grade ?? "",
    stickerPrice: it.sticker_price != null ? String(it.sticker_price) : "",
    productType: it.product_type ?? "",
    quantity: it.quantity != null ? String(it.quantity) : "1",
    language: it.language ?? "english",
  };
}

// Grade options per company: top = most-used (shown first), rest = full list
export const GRADE_OPTIONS: Record<string, { top: string[]; rest: string[] }> = {
  PSA: {
    top: ["10", "9", "8"],
    rest: ["7", "6", "5", "4", "3", "2", "1"],
  },
  BGS: {
    top: ["10 Black Label", "10", "9.5", "9", "8.5", "8"],
    rest: ["7.5", "7", "6.5", "6", "5.5", "5", "4.5", "4", "3.5", "3", "2.5", "2", "1.5", "1"],
  },
  CGC: {
    top: ["10 Perfect", "10 Pristine", "9.5", "9", "8.5", "8"],
    rest: ["7.5", "7", "6.5", "6", "5.5", "5", "4.5", "4", "3.5", "3", "2.5", "2", "1.5", "1"],
  },
  TAG: {
    top: ["10", "9.5", "9", "8.5", "8"],
    rest: ["7.5", "7", "6.5", "6", "5.5", "5", "4", "3", "2", "1"],
  },
};
export const GRADE_COMPANIES = ["PSA", "BGS", "CGC", "TAG"] as const;

// ── Shared class strings ──
export const fieldClass = "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground";
export const btnOutline = "inline-flex h-11 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-muted disabled:opacity-40";
export const btnPrimary = "inline-flex h-11 items-center justify-center rounded-lg bg-accent-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-accent-primary-hover disabled:opacity-40";
export const btnDanger = "inline-flex h-11 items-center justify-center rounded-lg border border-negative-border bg-negative-soft px-4 text-sm font-semibold text-negative transition-colors duration-150 disabled:opacity-40";
export const pillClass = "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground";
export const pillAccent = "inline-flex items-center rounded-full bg-accent-primary-soft px-2 py-0.5 text-xs font-medium text-accent-primary";
export const pillWarning = "inline-flex items-center rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning-strong";
export const pillPositive = "inline-flex items-center rounded-full bg-positive-soft px-2 py-0.5 text-xs font-medium text-positive-strong";

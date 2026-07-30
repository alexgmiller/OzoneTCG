"use client";

import { parseGrade } from "@/lib/ebay-client";
import type { SlabPrice } from "./InventoryServer";
import type { Item, ItemForm } from "./types";

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

/**
 * Returns the effective cost for an item: prefer cost_basis (trade chain cash invested)
 * over manual cost. Returns null if neither is set (item is uncosted).
 */
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
  if (pct > 25) return <span className="text-[10px] font-semibold text-amber-500 tabular-nums whitespace-nowrap">▲ +{abs.toFixed(0)}%</span>;
  if (pct > 10) return <span className="text-[10px] font-semibold text-green-500 tabular-nums whitespace-nowrap">▲ +{abs.toFixed(0)}%</span>;
  if (pct < -10) return <span className="text-[10px] font-semibold text-red-500 tabular-nums whitespace-nowrap">▼ -{abs.toFixed(0)}%</span>;
  return <span className="text-[10px] opacity-35 tabular-nums whitespace-nowrap">— {pct >= 0 ? "+" : ""}{pct.toFixed(0)}%</span>;
}

export function MovementDot({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  if (pct > 25) return <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title={`+${pct.toFixed(0)}% since acquired`} />;
  if (pct > 10) return <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" title={`+${pct.toFixed(0)}% since acquired`} />;
  if (pct < -10) return <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" title={`${pct.toFixed(0)}% since acquired`} />;
  return null;
}

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

export function buildSlabEbayQuery(name: string, grade: string | null, setName: string | null, cardNumber: string | null): string {
  const cleanName = name.replace(/\b(JP|JPN|EN|ENG|Japanese|English)\b\s*/gi, "").trim();
  const num = cardNumber?.split("/")[0]?.trim() ?? "";
  return [grade, cleanName, setName, num].filter(Boolean).join(" ");
}

export function buildRawEbayQuery(name: string, setName: string | null, cardNumber: string | null): string {
  const cleanName = name.replace(/\b(JP|JPN|EN|ENG|Japanese|English)\b\s*/gi, "").trim();
  const num = cardNumber?.split("/")[0]?.trim() ?? "";
  return [cleanName, setName, num].filter(Boolean).join(" ");
}

// ── Year helpers (kept for reference / future use) ─────────────────────────

const SET_YEAR_MAP: Record<string, number> = {
  "Base Set": 1999, "Jungle": 1999, "Fossil": 1999, "Base Set 2": 2000,
  "Team Rocket": 2000, "Gym Heroes": 2000, "Gym Challenge": 2000,
  "Neo Genesis": 2000, "Neo Discovery": 2001, "Neo Revelation": 2001, "Neo Destiny": 2002,
  "Expedition Base Set": 2002, "Aquapolis": 2003, "Skyridge": 2003,
  "EX Ruby & Sapphire": 2003, "EX Sandstorm": 2003, "EX Dragon": 2003,
  "EX Team Magma vs Team Aqua": 2004, "EX Hidden Legends": 2004,
  "EX FireRed & LeafGreen": 2004, "EX Team Rocket Returns": 2004,
  "EX Deoxys": 2005, "EX Emerald": 2005, "EX Unseen Forces": 2005,
  "EX Delta Species": 2005, "EX Legend Maker": 2006, "EX Holon Phantoms": 2006,
  "EX Crystal Guardians": 2006, "EX Dragon Frontiers": 2006, "EX Power Keepers": 2007,
  "Diamond & Pearl": 2007, "Mysterious Treasures": 2007, "Secret Wonders": 2007,
  "Great Encounters": 2008, "Majestic Dawn": 2008, "Legends Awakened": 2008,
  "Stormfront": 2008, "Platinum": 2009, "Rising Rivals": 2009,
  "Supreme Victors": 2009, "Arceus": 2009,
  "HeartGold & SoulSilver": 2010, "Unleashed": 2010, "Undaunted": 2010, "Triumphant": 2010,
  "Call of Legends": 2011,
  "Black & White": 2011, "Emerging Powers": 2011, "Noble Victories": 2011,
  "Next Destinies": 2012, "Dark Explorers": 2012, "Dragons Exalted": 2012,
  "Dragon Vault": 2012, "Boundaries Crossed": 2012,
  "Plasma Storm": 2013, "Plasma Freeze": 2013, "Plasma Blast": 2013,
  "Legendary Treasures": 2013,
  "XY": 2014, "Flashfire": 2014, "Furious Fists": 2014, "Phantom Forces": 2014,
  "Primal Clash": 2015, "Roaring Skies": 2015, "Ancient Origins": 2015,
  "BREAKthrough": 2015, "BREAKpoint": 2016, "Generations": 2016, "Fates Collide": 2016,
  "Steam Siege": 2016, "Evolutions": 2016,
  "Sun & Moon": 2017, "Guardians Rising": 2017, "Burning Shadows": 2017,
  "Crimson Invasion": 2017, "Shining Legends": 2017,
  "Ultra Prism": 2018, "Forbidden Light": 2018, "Celestial Storm": 2018,
  "Dragon Majesty": 2018, "Lost Thunder": 2018,
  "Team Up": 2019, "Detective Pikachu": 2019, "Unbroken Bonds": 2019,
  "Unified Minds": 2019, "Hidden Fates": 2019, "Cosmic Eclipse": 2019,
  "Sword & Shield": 2020, "Rebel Clash": 2020, "Darkness Ablaze": 2020,
  "Champion's Path": 2020, "Vivid Voltage": 2020,
  "Battle Styles": 2021, "Chilling Reign": 2021, "Evolving Skies": 2021,
  "Celebrations": 2021, "Fusion Strike": 2021,
  "Brilliant Stars": 2022, "Astral Radiance": 2022, "Pokémon GO": 2022,
  "Lost Origin": 2022, "Silver Tempest": 2022,
  "Crown Zenith": 2023, "Scarlet & Violet": 2023, "Paldea Evolved": 2023,
  "Obsidian Flames": 2023, "151": 2023, "Paradox Rift": 2023,
  "Paldean Fates": 2024, "Temporal Forces": 2024, "Twilight Masquerade": 2024,
  "Shrouded Fable": 2024, "Stellar Crown": 2024, "Surging Sparks": 2024,
  "Prismatic Evolutions": 2025, "Journey Together": 2025,
};

/** Extract a 4-digit year from a set name. */
export function inferCardYear(setName: string | null | undefined): number | null {
  if (!setName) return null;
  const mapped = SET_YEAR_MAP[setName.trim()];
  if (mapped) return mapped;
  const m = setName.match(/\b(19[0-9]{2}|20[0-9]{2})\b/);
  return m ? parseInt(m[1]) : null;
}

/** Extract year from eBay listing titles (e.g. "2003 Pokemon EX Dragon ..."). */
export function yearFromEbayTitles(titles: string[]): number | null {
  for (const t of titles) {
    const m = t.match(/\b(19[0-9]{2}|20[0-9]{2})\b/);
    if (m) return parseInt(m[1]);
  }
  return null;
}

export const categoryColors: Record<string, string> = {
  single: "bg-blue-100 text-blue-800",
  slab: "bg-purple-100 text-purple-800",
  sealed: "bg-teal-100 text-teal-800",
};

export function gradeStyle(grade: string): string {
  const parsed = parseGrade(grade);
  const company = parsed?.company?.toUpperCase() ?? "";
  const n = parsed ? parseFloat(parsed.grade) : 0;
  const isBlack = parsed?.grade?.toLowerCase().includes("black") ?? false;

  if (company === "PSA") {
    if (n >= 10) return "grade-badge grade-psa grade-psa-10";
    return "grade-badge grade-psa";
  }
  if (company === "BGS") {
    if (isBlack || n >= 10) return "grade-badge grade-bgs grade-bgs-10";
    return "grade-badge grade-bgs";
  }
  if (company === "CGC") {
    if (n >= 10) return "grade-badge grade-cgc grade-cgc-10";
    return "grade-badge grade-cgc";
  }
  if (company === "TAG") {
    if (n >= 10) return "grade-badge grade-tag grade-tag-10";
    return "grade-badge grade-tag";
  }
  return "grade-badge grade-other";
}

/** Maps a grade string to the slab label bar details for grid view rendering. */
export function slabGradeLabel(grade: string | null): { company: string; companyKey: string; gradeNum: string; labelText: string } | null {
  if (!grade) return null;
  const parsed = parseGrade(grade);
  if (!parsed) return null;
  const gradeStr = parsed.grade;
  const n = parseFloat(gradeStr);
  const isBlack = gradeStr.toLowerCase().includes("black");
  let labelText: string;
  if (isBlack)   labelText = "PRISTINE";
  else if (n >= 10)  labelText = "GEM MT";
  else if (n >= 9.5) labelText = "GEM MT";
  else if (n >= 9)   labelText = "MINT";
  else if (n >= 8.5) labelText = "NM-MT+";
  else if (n >= 8)   labelText = "NM-MT";
  else if (n >= 7.5) labelText = "NM+";
  else if (n >= 7)   labelText = "NM";
  else if (n >= 6)   labelText = "EX-MT";
  else if (n >= 5)   labelText = "EX";
  else if (n >= 4)   labelText = "VG-EX";
  else if (n >= 3)   labelText = "VG";
  else if (n >= 2)   labelText = "GOOD";
  else if (n >= 1)   labelText = "POOR";
  else labelText = gradeStr.toUpperCase();
  const company = parsed.company.toUpperCase();
  const companyKey = ["PSA", "BGS", "CGC", "TAG"].includes(company) ? company.toLowerCase() : "other";
  return { company, companyKey, gradeNum: isBlack ? "10" : gradeStr, labelText };
}

// ── Staleness tiers ────────────────────────────────────────────────────────
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

export function nullLast(a: number | null, b: number | null, asc: boolean): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return asc ? a - b : b - a;
}

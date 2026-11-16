// ── Condition pricing for one-price sources ──
// JustTCG prices each condition separately (lib/justtcg.ts → priceForCondition).
// The other single-card sources don't: TCGplayer's market price via TCGCSV,
// TCGdex, and eBay asking prices when there aren't enough played listings all
// give one price that mostly reflects near-mint copies. Without an adjustment a
// Lightly Played or Damaged copy would be valued as near mint.
//
// The discount per condition is learned each night from the cards JustTCG has
// priced (raw_card_prices): the median of LP/NM, MP/NM… over cards worth at
// least $5 near mint, where condition actually moves the price. With too few
// such cards for a condition, a fixed default is used.

export type PlayedCondition = "lp" | "mp" | "hp" | "dmg";
export type ConditionFactors = Record<PlayedCondition, number>;

export const DEFAULT_FACTORS: ConditionFactors = { lp: 0.8, mp: 0.65, hp: 0.5, dmg: 0.35 };
export const MIN_SAMPLES = 20;
export const MIN_NM_PRICE = 5;

const ORDER: PlayedCondition[] = ["lp", "mp", "hp", "dmg"];
const LABELS: Record<string, PlayedCondition> = {
  "lightly played": "lp",
  "moderately played": "mp",
  "heavily played": "hp",
  damaged: "dmg",
};

// The played condition an item is in, or null for near mint / not set
export function playedCondition(condition: string | null | undefined): PlayedCondition | null {
  return LABELS[(condition ?? "").trim().toLowerCase()] ?? null;
}

export type ConditionPriceRow = {
  nm_price: number | null;
  lp_price: number | null;
  mp_price: number | null;
  hp_price: number | null;
  dmg_price: number | null;
};

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const ok = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

export type LearnedFactors = {
  factors: ConditionFactors;
  /** How many cards each factor was learned from (0 = default used) */
  samples: Record<PlayedCondition, number>;
};

export function learnFactors(rows: ConditionPriceRow[]): LearnedFactors {
  const factors = { ...DEFAULT_FACTORS };
  const samples: Record<PlayedCondition, number> = { lp: 0, mp: 0, hp: 0, dmg: 0 };
  for (const c of ORDER) {
    const ratios = rows
      .filter((r) => ok(r.nm_price) && r.nm_price >= MIN_NM_PRICE && ok(r[`${c}_price`]))
      // A played price above near mint is thin data, not a premium
      .map((r) => Math.min(1, r[`${c}_price`]! / r.nm_price!));
    if (ratios.length >= MIN_SAMPLES) {
      factors[c] = Math.round(median(ratios) * 100) / 100;
      samples[c] = ratios.length;
    }
  }
  // Worse condition never prices above better condition
  for (let i = 1; i < ORDER.length; i++) {
    factors[ORDER[i]] = Math.min(factors[ORDER[i]], factors[ORDER[i - 1]]);
  }
  return { factors, samples };
}

// A one-price (near mint) market price, scaled for the item's condition
export function adjustForCondition(price: number, condition: string | null | undefined, factors: ConditionFactors): number {
  const c = playedCondition(condition);
  if (!c) return price;
  return Math.round(price * factors[c] * 100) / 100;
}

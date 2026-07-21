/**
 * Buy/pass scoring — shared between client and server.
 * No Node.js / browser-only imports allowed here.
 *
 * Weighted 0-100 score over four factors:
 *   deal       50%  — asking price vs blended FMV
 *   liquidity  25%  — sold count in the trailing 90 days
 *   momentum   15%  — 30-day median vs 90-day median (from sold_comps)
 *   spread     10%  — gap between listed Q1 and sold median
 * then multiplied by a scarcity multiplier derived from PSA population
 * growth (from pop_snapshots).
 *
 * Every factor reports its own subscore, effective weight, and a plain-English
 * detail line so the UI can show a vendor WHY a card scored the way it did.
 * Factors with too little data are EXCLUDED (weights renormalized across the
 * rest) rather than silently defaulting — thin data is flagged, not faked.
 * Low-population cards that rarely sell will typically score with momentum
 * excluded; that's expected and the breakdown says so.
 */

import { iqrFilter, pctile, type FMVResult } from "./fmv";

// ── Inputs ────────────────────────────────────────────────────────────────────

/** One row from sold_comps (price/soldDate field names match fmv.ts). */
export type SoldComp = { price: number; soldDate: string };

/** One row from pop_snapshots for the target pop_key + grade. */
export type PopSnapshot = { population: number; snapshotDate: string };

export type ScoreInput = {
  askPrice: number;
  fmv: FMVResult;               // from computeBlendedFMV
  soldComps: SoldComp[];        // trailing ≥90d of comps for the comp_key
  popSnapshots: PopSnapshot[];  // snapshot history for the target grade
  now?: Date;                   // injectable for tests
};

// ── Outputs ───────────────────────────────────────────────────────────────────

export type FactorKey = "deal" | "liquidity" | "momentum" | "spread";
export type DataStatus = "ok" | "insufficient";

export type ScoreFactor = {
  key: FactorKey;
  label: string;
  /** Configured weight (0-1). */
  nominalWeight: number;
  /** Weight actually used after excluding insufficient factors (0 if excluded). */
  effectiveWeight: number;
  /** 0-100 subscore, null when excluded. */
  score: number | null;
  /** score × effectiveWeight — the factor's contribution to the base score. */
  weightedPoints: number;
  dataStatus: DataStatus;
  /** Plain-English explanation for the vendor-facing breakdown. */
  detail: string;
};

export type ScarcityResult = {
  /** Applied to the base score; 1.0 = neutral. */
  multiplier: number;
  /** e.g. 0.08 = population growing 8%/year. Null when insufficient data. */
  annualizedPopGrowth: number | null;
  latestPopulation: number | null;
  dataStatus: DataStatus;
  detail: string;
};

export type Verdict = "strong_buy" | "buy" | "borderline" | "pass" | "insufficient_data";

export type BuyPassScore = {
  /** 0-100 after scarcity multiplier; null only when FMV is unavailable. */
  finalScore: number | null;
  /** Weighted factor score before the scarcity multiplier. */
  baseScore: number | null;
  verdict: Verdict;
  factors: ScoreFactor[];
  scarcity: ScarcityResult;
};

// ── Tuning constants ──────────────────────────────────────────────────────────

export const FACTOR_WEIGHTS: Record<FactorKey, number> = {
  deal: 0.5,
  liquidity: 0.25,
  momentum: 0.15,
  spread: 0.1,
};

/** Deal: buying this % below FMV scores 100; the same % above scores 0. */
const DEAL_FULL_RANGE_PCT = 20;

/** Liquidity: sold count at which the subscore saturates at 100. */
const LIQUIDITY_SATURATION_COUNT = 20;

/** Momentum: minimum IQR-filtered sales per window to trust the medians. */
const MIN_SAMPLES_30D = 3;
const MIN_SAMPLES_90D = 5;
/** Momentum: a ±this-% median delta maps to the 0/100 extremes. */
const MOMENTUM_FULL_RANGE_PCT = 30;

/** Spread: |listed Q1 − sold median| of this % (or more) of sold median scores 0. */
const SPREAD_ZERO_PCT = 40;

/** Scarcity: snapshots must span at least this many days to compute growth. */
const MIN_POP_SPAN_DAYS = 14;
/** Scarcity: annualized pop growth considered "normal" (multiplier 1.0). */
const NEUTRAL_POP_GROWTH = 0.1;
/** Scarcity: multiplier moves this much per 100% of growth deviation. */
const SCARCITY_SLOPE = 0.5;
const SCARCITY_MIN = 0.85;
const SCARCITY_MAX = 1.1;

const VERDICT_STRONG_BUY = 80;
const VERDICT_BUY = 65;
const VERDICT_BORDERLINE = 50;

// ── Helpers ───────────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const usd = (v: number) => `$${v.toFixed(2)}`;
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

function compsInWindow(comps: SoldComp[], now: Date, days: number): number[] {
  const cutoff = now.getTime() - days * 86_400_000;
  return comps
    .filter((c) => {
      const t = new Date(c.soldDate).getTime();
      return !isNaN(t) && t >= cutoff && t <= now.getTime() && c.price > 1;
    })
    .map((c) => c.price);
}

// ── Momentum ──────────────────────────────────────────────────────────────────

export type MomentumResult = {
  /** % delta of 30d median vs 90d median (e.g. +12.5). Null when insufficient. */
  deltaPct: number | null;
  median30d: number | null;
  median90d: number | null;
  count30d: number;
  count90d: number;
  dataStatus: DataStatus;
};

/**
 * Momentum from sold_comps: IQR-filtered 30-day median vs 90-day median,
 * as a percentage delta. Positive = price rising. Requires enough sales in
 * BOTH windows — sparse comps (common for low-pop cards) return insufficient
 * rather than a noisy fake signal.
 */
export function computeMomentum(soldComps: SoldComp[], now: Date = new Date()): MomentumResult {
  const win30 = iqrFilter(compsInWindow(soldComps, now, 30));
  const win90 = iqrFilter(compsInWindow(soldComps, now, 90));

  if (win30.length < MIN_SAMPLES_30D || win90.length < MIN_SAMPLES_90D) {
    return {
      deltaPct: null,
      median30d: win30.length > 0 ? pctile(win30, 0.5) : null,
      median90d: win90.length > 0 ? pctile(win90, 0.5) : null,
      count30d: win30.length,
      count90d: win90.length,
      dataStatus: "insufficient",
    };
  }

  const m30 = pctile(win30, 0.5);
  const m90 = pctile(win90, 0.5);
  return {
    deltaPct: ((m30 - m90) / m90) * 100,
    median30d: m30,
    median90d: m90,
    count30d: win30.length,
    count90d: win90.length,
    dataStatus: "ok",
  };
}

// ── Scarcity ──────────────────────────────────────────────────────────────────

/**
 * Population-growth-adjusted scarcity multiplier from pop_snapshots.
 *
 * Annualized growth = (latest/earliest)^(365/spanDays) − 1, computed over the
 * full snapshot span for the target grade. A frozen population (nobody grading
 * more copies) earns a bonus up to SCARCITY_MAX; a fast-growing population
 * (supply inflating, e.g. everyone cracking-and-regrading a hot card) is
 * penalized down to SCARCITY_MIN. NEUTRAL_POP_GROWTH/year is the 1.0 midpoint.
 */
export function computeScarcity(
  popSnapshots: PopSnapshot[],
  now: Date = new Date(),
): ScarcityResult {
  const valid = popSnapshots
    .map((s) => ({ population: s.population, t: new Date(s.snapshotDate).getTime() }))
    .filter((s) => !isNaN(s.t) && s.population >= 0)
    .sort((a, b) => a.t - b.t);

  const latest = valid.length > 0 ? valid[valid.length - 1] : null;

  if (valid.length < 2) {
    return {
      multiplier: 1,
      annualizedPopGrowth: null,
      latestPopulation: latest?.population ?? null,
      dataStatus: "insufficient",
      detail:
        latest != null
          ? `Only one population snapshot (pop ${latest.population}) — need history spanning ${MIN_POP_SPAN_DAYS}+ days to measure growth. Neutral multiplier applied.`
          : "No population snapshots yet — neutral multiplier applied.",
    };
  }

  const earliest = valid[0];
  const spanDays = (latest!.t - earliest.t) / 86_400_000;

  if (spanDays < MIN_POP_SPAN_DAYS || earliest.population === 0) {
    return {
      multiplier: 1,
      annualizedPopGrowth: null,
      latestPopulation: latest!.population,
      dataStatus: "insufficient",
      detail:
        earliest.population === 0
          ? `Earliest snapshot shows population 0 — growth rate undefined. Neutral multiplier applied (current pop ${latest!.population}).`
          : `Snapshots span only ${Math.round(spanDays)} days (need ${MIN_POP_SPAN_DAYS}+) — too short to trust a growth rate. Neutral multiplier applied.`,
    };
  }

  const growth = Math.pow(latest!.population / earliest.population, 365 / spanDays) - 1;
  const multiplier = clamp(
    1 + (NEUTRAL_POP_GROWTH - growth) * SCARCITY_SLOPE,
    SCARCITY_MIN,
    SCARCITY_MAX,
  );

  const direction =
    multiplier > 1.005 ? "scarcity bonus" : multiplier < 0.995 ? "supply-inflation penalty" : "neutral";
  return {
    multiplier,
    annualizedPopGrowth: growth,
    latestPopulation: latest!.population,
    dataStatus: "ok",
    detail: `Population ${earliest.population} → ${latest!.population} over ${Math.round(spanDays)} days (${pct(growth * 100)}/yr annualized) — ${direction} ×${multiplier.toFixed(2)}.`,
  };
}

// ── Factor subscores ──────────────────────────────────────────────────────────

function dealFactor(askPrice: number, fmv: FMVResult): ScoreFactor {
  const base = {
    key: "deal" as const,
    label: "Deal vs FMV",
    nominalWeight: FACTOR_WEIGHTS.deal,
    effectiveWeight: 0,
    weightedPoints: 0,
  };
  if (fmv.fmv == null || askPrice <= 0) {
    return {
      ...base,
      score: null,
      dataStatus: "insufficient",
      detail:
        fmv.fmv == null
          ? "No blended FMV available — cannot evaluate the deal."
          : "No asking price provided.",
    };
  }
  const discountPct = (1 - askPrice / fmv.fmv) * 100; // + = below FMV
  const score = clamp(50 + discountPct * (50 / DEAL_FULL_RANGE_PCT), 0, 100);
  const rel = discountPct >= 0 ? `${discountPct.toFixed(1)}% below` : `${(-discountPct).toFixed(1)}% above`;
  return {
    ...base,
    score,
    dataStatus: "ok",
    detail: `Asking ${usd(askPrice)} is ${rel} blended FMV ${usd(fmv.fmv)} (${fmv.mode} mode).`,
  };
}

function liquidityFactor(count90d: number): ScoreFactor {
  // Log curve: early sales matter most (3 sales ≈ 46, 10 ≈ 79, 20+ = 100).
  const score = clamp(
    (Math.log1p(count90d) / Math.log1p(LIQUIDITY_SATURATION_COUNT)) * 100,
    0,
    100,
  );
  const speed =
    count90d >= LIQUIDITY_SATURATION_COUNT
      ? "highly liquid"
      : count90d >= 8
        ? "sells steadily"
        : count90d >= 3
          ? "sells occasionally"
          : count90d > 0
            ? "sells rarely — expect a longer hold"
            : "no recorded sales in 90 days";
  return {
    key: "liquidity",
    label: "Liquidity",
    nominalWeight: FACTOR_WEIGHTS.liquidity,
    effectiveWeight: 0,
    score,
    weightedPoints: 0,
    dataStatus: "ok", // zero sales is real (bad) information, not missing data
    detail: `${count90d} sale${count90d === 1 ? "" : "s"} in the last 90 days — ${speed}.`,
  };
}

function momentumFactor(momentum: MomentumResult): ScoreFactor {
  const base = {
    key: "momentum" as const,
    label: "Momentum",
    nominalWeight: FACTOR_WEIGHTS.momentum,
    effectiveWeight: 0,
    weightedPoints: 0,
  };
  if (momentum.dataStatus === "insufficient" || momentum.deltaPct == null) {
    return {
      ...base,
      score: null,
      dataStatus: "insufficient",
      detail: `Too few sales to measure momentum (${momentum.count30d} in 30d, ${momentum.count90d} in 90d; need ${MIN_SAMPLES_30D}/${MIN_SAMPLES_90D}) — excluded from the score.`,
    };
  }
  const score = clamp(50 + momentum.deltaPct * (50 / MOMENTUM_FULL_RANGE_PCT), 0, 100);
  const trend = momentum.deltaPct > 2 ? "trending up" : momentum.deltaPct < -2 ? "trending down" : "flat";
  return {
    ...base,
    score,
    dataStatus: "ok",
    detail: `30d median ${usd(momentum.median30d!)} vs 90d median ${usd(momentum.median90d!)} (${pct(momentum.deltaPct)}) — ${trend}.`,
  };
}

function spreadFactor(fmv: FMVResult): ScoreFactor {
  const base = {
    key: "spread" as const,
    label: "Spread health",
    nominalWeight: FACTOR_WEIGHTS.spread,
    effectiveWeight: 0,
    weightedPoints: 0,
  };
  if (fmv.soldAnchor == null || fmv.listedAnchor == null || fmv.soldAnchor <= 0) {
    return {
      ...base,
      score: null,
      dataStatus: "insufficient",
      detail: "Need both sold and active listing data to measure the spread — excluded from the score.",
    };
  }
  const spreadPct = ((fmv.listedAnchor - fmv.soldAnchor) / fmv.soldAnchor) * 100;
  const score = clamp(100 - Math.abs(spreadPct) * (100 / SPREAD_ZERO_PCT), 0, 100);
  const reading =
    Math.abs(spreadPct) <= 10
      ? "tight spread, healthy market"
      : spreadPct > 0
        ? "listings priced well above recent solds — sellers may be anchored high"
        : "listings priced below recent solds — market may be softening";
  return {
    ...base,
    score,
    dataStatus: "ok",
    detail: `Listed Q1 ${usd(fmv.listedAnchor)} vs sold median ${usd(fmv.soldAnchor)} (${pct(spreadPct)}) — ${reading}.`,
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Compute the full buy/pass score with a per-factor breakdown.
 *
 * Typical wiring:
 *   const comps = await supabase.from("sold_comps")
 *     .select("sold_price, sold_date")
 *     .eq("comp_key", key)
 *     .gte("sold_date", ninetyDaysAgoISO);
 *   const pops = await supabase.from("pop_snapshots")
 *     .select("population, snapshot_date")
 *     .eq("pop_key", popKey).eq("grade", grade)
 *     .order("snapshot_date");
 *   const result = computeBuyPassScore({
 *     askPrice,
 *     fmv: computeBlendedFMV(soldItems, activeItems),
 *     soldComps: comps.map(c => ({ price: Number(c.sold_price), soldDate: c.sold_date })),
 *     popSnapshots: pops.map(p => ({ population: p.population, snapshotDate: p.snapshot_date })),
 *   });
 */
export function computeBuyPassScore(input: ScoreInput): BuyPassScore {
  const now = input.now ?? new Date();
  const comps = input.soldComps ?? [];

  const momentum = computeMomentum(comps, now);
  const scarcity = computeScarcity(input.popSnapshots ?? [], now);

  const factors: ScoreFactor[] = [
    dealFactor(input.askPrice, input.fmv),
    liquidityFactor(compsInWindow(comps, now, 90).length),
    momentumFactor(momentum),
    spreadFactor(input.fmv),
  ];

  // Without a deal factor the score is meaningless — don't fake one.
  const deal = factors[0];
  if (deal.dataStatus === "insufficient") {
    return { finalScore: null, baseScore: null, verdict: "insufficient_data", factors, scarcity };
  }

  // Renormalize weights across usable factors so exclusions don't drag the
  // score toward zero — the breakdown shows both nominal and effective weight.
  const usable = factors.filter((f) => f.dataStatus === "ok");
  const weightSum = usable.reduce((s, f) => s + f.nominalWeight, 0);
  let baseScore = 0;
  for (const f of usable) {
    f.effectiveWeight = f.nominalWeight / weightSum;
    f.weightedPoints = f.score! * f.effectiveWeight;
    baseScore += f.weightedPoints;
  }

  const finalScore = clamp(Math.round(baseScore * scarcity.multiplier), 0, 100);
  const verdict: Verdict =
    finalScore >= VERDICT_STRONG_BUY
      ? "strong_buy"
      : finalScore >= VERDICT_BUY
        ? "buy"
        : finalScore >= VERDICT_BORDERLINE
          ? "borderline"
          : "pass";

  return { finalScore, baseScore: Math.round(baseScore * 10) / 10, verdict, factors, scarcity };
}

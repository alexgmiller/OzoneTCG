/**
 * FMV tier selection — shared between client and server.
 * No Node.js / browser-only imports allowed here.
 */

export type PricingTier = "high_pop" | "medium" | "low_pop";
export type PricingStrategyOverride = "auto" | "q1" | "median" | "q3";

export type FMVSelection = {
  fmv: number | null;
  tier: PricingTier;
  label: "competitive" | "market" | "scarce";
};

/**
 * Pick the right price percentile based on card pop / era and vendor strategy.
 *
 * Auto-tier logic:
 *   HIGH_POP (pop > 1,000 or year >= 2020) → Q1     — lots of supply, price at the low end
 *   MEDIUM   (pop 100–1,000 or year 2010–2019) → median — balanced market
 *   LOW_POP  (pop < 100 or year < 2010)        → Q3    — scarce, sellers have leverage
 *
 * Priority: population data (if available) over year estimation.
 * Strategy override bypasses tier detection entirely.
 */
export function selectTierFMV(
  q1: number | null,
  median: number | null,
  q3: number | null,
  opts: {
    population?: number | null;
    year?: number | null;
    strategy?: PricingStrategyOverride;
  } = {}
): FMVSelection {
  const { population, year, strategy = "auto" } = opts;

  // Hard overrides — vendor knows best
  if (strategy === "q1")     return { fmv: q1 ?? median, tier: "high_pop", label: "competitive" };
  if (strategy === "median") return { fmv: median,        tier: "medium",   label: "market"      };
  if (strategy === "q3")     return { fmv: q3 ?? median,  tier: "low_pop",  label: "scarce"      };

  // Auto-tier
  let tier: PricingTier = "medium";
  let logNote: string;

  if (population != null) {
    if (population > 1000)      tier = "high_pop";
    else if (population >= 100) tier = "medium";
    else                        tier = "low_pop";
    logNote = `pop=${population}${year != null ? `, year=${year}` : ""}`;
  } else if (year != null) {
    if (year >= 2020)      tier = "high_pop";
    else if (year >= 2010) tier = "medium";
    else                   tier = "low_pop";
    logNote = `no pop data, year=${year}`;
  } else {
    logNote = "no pop data, no year — defaulting to median";
  }

  const pctLabel  = tier === "high_pop" ? "Q1" : tier === "low_pop" ? "Q3" : "median";
  const priceVal  = tier === "high_pop" ? (q1 ?? median) : tier === "low_pop" ? (q3 ?? median) : median;
  const tierLabel = tier === "high_pop" ? "HIGH_POP_MODERN" : tier === "low_pop" ? "LOW_POP_VINTAGE" : "MEDIUM";
  console.log(`[eBay] FMV tier: ${tierLabel} (${logNote}) → using ${pctLabel}=$${priceVal ?? "n/a"}`);

  if (tier === "high_pop") return { fmv: q1 ?? median, tier, label: "competitive" };
  if (tier === "low_pop")  return { fmv: q3 ?? median, tier, label: "scarce"      };
  return                           { fmv: median,       tier, label: "market"      };
}

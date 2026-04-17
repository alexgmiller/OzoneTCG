/**
 * FMV calculation — shared between client and server.
 * No Node.js / browser-only imports allowed here.
 */

export type FMVMode = "blended" | "active_only" | "sold_only" | "none";

export type FMVResult = {
  fmv: number | null;
  mode: FMVMode;
  soldAnchor: number | null;    // IQR-filtered median of recent sold prices
  listedAnchor: number | null;  // IQR-filtered Q1 of active listing prices
  soldCount: number;            // # sold items used (after filter)
  activeCount: number;          // # active items used (after filter)
};

/** Linear-interpolation percentile on a pre-sorted array. */
function pctile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const frac = idx - lo;
  return frac === 0 ? sorted[lo] : sorted[lo] * (1 - frac) + sorted[lo + 1] * frac;
}

/** Remove IQR outliers from a price list. Returns the cleaned, sorted subset. */
function iqrFilter(prices: number[]): number[] {
  const sorted = [...prices].sort((a, b) => a - b);
  if (sorted.length < 4) return sorted;
  const q1 = pctile(sorted, 0.25);
  const q3 = pctile(sorted, 0.75);
  const iqr = q3 - q1;
  const filtered = sorted.filter((p) => p >= q1 - 1.5 * iqr && p <= q3 + 1.5 * iqr);
  return filtered.length > 0 ? filtered : sorted;
}

/**
 * Compute blended FMV from sold and active listing data.
 *
 * Two anchor points:
 *   SOLD ANCHOR:   median of IQR-filtered sold prices (what buyers recently paid)
 *   LISTED ANCHOR: Q1 of IQR-filtered active listing prices (realistic low end of current supply)
 *
 * FMV = recency-weighted average of both anchors:
 *   Most recent sale ≤7 days:   50% sold / 50% listed
 *   Most recent sale 7–30 days: 40% sold / 60% listed
 *   Most recent sale 30+ days:  25% sold / 75% listed  (market may have shifted)
 *
 * Degrades gracefully to a single source when the other is unavailable.
 *
 * Callers are responsible for pre-filtering invalid sold records (e.g. pure
 * best-offer sales where the negotiated price is unknown) before passing here.
 */
export function computeBlendedFMV(
  soldItems: Array<{ price: number; soldDate: string }> | null | undefined,
  activeItems: Array<{ price: number }> | null | undefined,
): FMVResult {
  const cleanSold   = iqrFilter((soldItems   ?? []).filter((s) => s.price > 1).map((s) => s.price));
  const cleanActive = iqrFilter((activeItems ?? []).filter((s) => s.price > 1).map((s) => s.price));

  const soldAnchor   = cleanSold.length   > 0 ? Math.round(pctile(cleanSold,   0.5))  : null;
  const listedAnchor = cleanActive.length > 0 ? Math.round(pctile(cleanActive, 0.25)) : null;

  if (soldAnchor != null && listedAnchor != null) {
    let soldWeight = 0.5;
    let listedWeight = 0.5;
    const dates = (soldItems ?? []).map((s) => new Date(s.soldDate).getTime()).filter((t) => !isNaN(t));
    if (dates.length > 0) {
      const daysSince = (Date.now() - Math.max(...dates)) / 86_400_000;
      if (daysSince > 30)     { soldWeight = 0.25; listedWeight = 0.75; }
      else if (daysSince > 7) { soldWeight = 0.40; listedWeight = 0.60; }
    }
    const fmv = Math.round(soldAnchor * soldWeight + listedAnchor * listedWeight);
    console.log(
      `[eBay] FMV mode: BLENDED (sold median=$${soldAnchor}, listed Q1=$${listedAnchor}, weights=${soldWeight}/${listedWeight}) → $${fmv}`
    );
    return { fmv, mode: "blended", soldAnchor, listedAnchor, soldCount: cleanSold.length, activeCount: cleanActive.length };
  }

  if (listedAnchor != null) {
    console.log(`[eBay] FMV mode: ACTIVE_ONLY (no sold data) → using Q1=$${listedAnchor}`);
    return { fmv: listedAnchor, mode: "active_only", soldAnchor: null, listedAnchor, soldCount: 0, activeCount: cleanActive.length };
  }

  if (soldAnchor != null) {
    console.log(`[eBay] FMV mode: SOLD_ONLY → using median=$${soldAnchor}`);
    return { fmv: soldAnchor, mode: "sold_only", soldAnchor, listedAnchor: null, soldCount: cleanSold.length, activeCount: 0 };
  }

  return { fmv: null, mode: "none", soldAnchor: null, listedAnchor: null, soldCount: 0, activeCount: 0 };
}

// Kept for backward compatibility — settings table still references these values.
export type PricingStrategyOverride = "auto" | "q1" | "median" | "q3";

// ── PokeInvest ──
// Prices from completed sales (eBay, TCGplayer, Goldin and other auction
// houses): one median for ungraded copies, all conditions together, and one
// per grade at PSA, CGC, BGS, TAG, ACE and SGC, each with its sale count and
// window. A price is published only when 3+ sales back it. No sealed products.
//
// Cards are looked up by TCGplayer product ID or by PokeInvest ID (pi_…).
// Every lookup is one call: 1,000 a month on the free key, 10,000 on the $29
// plan, resetting on the 1st. Wherever the data is shown, link "Prices by
// PokeInvest" to pokeinvest.io (the free key's one condition).

import { shrink } from "./pptCheck";

export const POKEINVEST_URL = "https://www.pokeinvest.io";

export type PokeInvestPrice = {
  median_usd: number | null;
  low_usd: number | null;
  high_usd: number | null;
  sales: number;
  window_days: number;
  newest_sale?: { date: string | null; usd: number | null };
  /** Fraction: -0.12 is 12% down on the previous window */
  change_vs_previous_window: number | null;
};

export type PokeInvestGraded = PokeInvestPrice & { grader: string; grade: string };

export type PokeInvestPrices = {
  pokeinvest_id: string;
  tcgplayer_id: string | null;
  name: string;
  set_name: string;
  page_url: string;
  currency: string;
  ungraded: PokeInvestPrice | null;
  graded: PokeInvestGraded[];
};

export function pokeinvestPricesUrl(card: string | number): string {
  return `${POKEINVEST_URL}/api/prices/${encodeURIComponent(String(card))}`;
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function describe(p: PokeInvestPrice): string {
  const sales = `${p.sales} sale${p.sales === 1 ? "" : "s"}`;
  if (p.median_usd == null) return `no price (${sales})`;
  return `${usd(p.median_usd)}, median of ${sales} in ${p.window_days} days`;
}

/** The prices as one readable line each, for Settings → Check price sources */
export function summarizePrices(p: PokeInvestPrices, maxGrades = 12) {
  const graded = (p.graded ?? []).map((g) => `${g.grader} ${g.grade}: ${describe(g)}`);
  return {
    card: `${p.name} · ${p.set_name}`,
    ungraded: p.ungraded ? describe(p.ungraded) : "no ungraded sales",
    graded: graded.length > maxGrades
      ? [...graded.slice(0, maxGrades), `…${graded.length - maxGrades} more grades`]
      : graded,
  };
}

function errorFor(status: number): string {
  if (status === 401) return "The key was rejected (401). Check POKEINVEST_API_KEY in Vercel.";
  if (status === 404) return "PokeInvest doesn't know this card (404).";
  if (status === 429) return "This month's calls are used up (429). They reset on the 1st.";
  return `PokeInvest answered ${status}.`;
}

type Answer = { status: number; limits: Record<string, string>; body: unknown };

async function getPrices(card: string | number, key: string): Promise<Answer> {
  const res = await fetch(pokeinvestPricesUrl(card), {
    headers: { "X-API-Key": key },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const limits = Object.fromEntries([...res.headers].filter(([k]) => /rate|limit|remaining|usage|quota|calls/i.test(k)));
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* not JSON: keep the text */ }
  return { status: res.status, limits, body };
}

export type PokeInvestCheck = {
  configured: boolean;
  ok?: boolean;
  status?: number;
  error?: string;
  /** How the card was found: by its TCGplayer ID, or only by its PokeInvest ID */
  foundBy?: "tcgplayer" | "pokeinvest";
  /** Whether the answer is the card we meant */
  rightCard?: boolean;
  /** Monthly-call headers, when the API sends them */
  limits?: Record<string, string>;
  summary?: ReturnType<typeof summarizePrices>;
  /** The response, shortened (long arrays and strings cut) */
  sample?: unknown;
};

// Looks the card up by TCGplayer ID, the way the app would, and when that
// misses tries its PokeInvest ID, to tell "no data" apart from "not linked to
// TCGplayer". 1 call, or 2 on a miss. The key never leaves the server.
export async function checkPokeInvest(card: { tcgPlayerId: number; pokeinvestId: string }): Promise<PokeInvestCheck> {
  const key = process.env.POKEINVEST_API_KEY?.trim();
  if (!key) return { configured: false };
  try {
    let foundBy: PokeInvestCheck["foundBy"] = "tcgplayer";
    let answer = await getPrices(card.tcgPlayerId, key);
    if (answer.status === 404) {
      foundBy = "pokeinvest";
      answer = await getPrices(card.pokeinvestId, key);
    }
    const { status, limits, body } = answer;
    const sample = shrink(body);
    if (status < 200 || status >= 300) {
      return { configured: true, ok: false, status, limits, error: errorFor(status), sample };
    }
    if (!body || typeof body !== "object") {
      return { configured: true, ok: false, status, limits, error: "PokeInvest sent something other than JSON.", sample };
    }
    const prices = body as PokeInvestPrices;
    return {
      configured: true,
      ok: true,
      status,
      foundBy,
      rightCard: prices.pokeinvest_id === card.pokeinvestId,
      limits,
      summary: summarizePrices(prices),
      sample,
    };
  } catch (e) {
    return { configured: true, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

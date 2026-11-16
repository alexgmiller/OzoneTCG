// TCGplayer market price for one catalog card, via TCGdex. Shared by
// /api/card-price and the Search card detail.
//
// TCGdex can be slow for a card nobody has asked for lately, so callers that
// show the result to a person want to know a failed lookup ("couldn't load")
// apart from a card that genuinely has no price.

const TCGDEX_EN = "https://api.tcgdex.net/v2/en";
const DEFAULT_TIMEOUT_MS = 6000;

export type TcgdexPrice = { market: number | null; failed: boolean };

export async function fetchTcgdexPrice(cardId: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<TcgdexPrice> {
  // Pocket card IDs start with an uppercase letter and have no TCGplayer pricing
  if (!cardId || /^[A-Z]/.test(cardId)) return { market: null, failed: false };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${TCGDEX_EN}/cards/${encodeURIComponent(cardId)}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (res.status === 404) return { market: null, failed: false };
    if (!res.ok) return { market: null, failed: true };
    const card = await res.json();
    const p = card?.pricing?.tcgplayer;
    const market = p?.normal?.marketPrice ?? p?.holofoil?.marketPrice ?? p?.reverseHolofoil?.marketPrice ?? null;
    return { market, failed: false };
  } catch {
    return { market: null, failed: true }; // timeout or network
  } finally {
    clearTimeout(timer);
  }
}

// Price or null, for callers that treat "unknown" and "none" the same
export async function fetchTcgdexMarket(cardId: string): Promise<number | null> {
  return (await fetchTcgdexPrice(cardId)).market;
}

// ── TCGplayer prices (via TCGCSV) ──
// Rarity and per-printing prices for catalog cards, found the same way as
// TCGplayer art: the card's set maps to TCGplayer group(s), then the exact
// card by number (lib/tcgplayerMatch.ts). Cards that don't match get no quote
// rather than a guess. Lists are shared and kept for hours (lib/tcgcsv.ts),
// so a search grid costs one download per set and the card sheet reuses it.

import { tcgGroups, tcgPrices, tcgProducts } from "./tcgcsv";
import { CATEGORY, candidateGroups, pickProduct, toQuote, type Quote } from "./tcgplayerMatch";

export type QuoteRequest = { key: string; name: string; setName: string | null; cardNumber: string | null };

// Quotes by request key; cards with no TCGplayer match are left out
export async function lookupTcgplayerQuotes(cards: QuoteRequest[], lang: "en" | "ja" = "en"): Promise<Record<string, Quote>> {
  const category = CATEGORY[lang];
  const groups = await tcgGroups(category);
  if (!groups.length || !cards.length) return {};

  // Results share sets; resolve each set once
  const bySet = new Map<string, QuoteRequest[]>();
  for (const c of cards) bySet.set(c.setName ?? "", [...(bySet.get(c.setName ?? "") ?? []), c]);

  const out: Record<string, Quote> = {};
  await Promise.all([...bySet].map(async ([setName, inSet]) => {
    for (const g of candidateGroups(setName, groups, lang)) {
      const pending = inSet.filter((c) => !out[c.key]);
      if (!pending.length) break;
      const [products, prices] = await Promise.all([tcgProducts(category, g.groupId), tcgPrices(category, g.groupId)]);
      for (const c of pending) {
        const p = pickProduct(products, c.name, c.cardNumber);
        if (p) out[c.key] = toQuote(p, prices);
      }
    }
  }));
  return out;
}

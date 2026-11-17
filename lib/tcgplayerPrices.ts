// ── TCGplayer prices (via TCGCSV) ──
// Rarity and per-printing prices for catalog cards, found the same way as
// TCGplayer art: the card's set maps to TCGplayer group(s), then the exact
// card by number (lib/tcgplayerMatch.ts). Cards that don't match get no quote
// rather than a guess. Lists are shared and kept for hours (lib/tcgcsv.ts),
// so a search grid costs one download per set and the card sheet reuses it.

import { cardLang } from "./cardArtMatch";
import { tcgGroups, tcgPrices, tcgProducts } from "./tcgcsv";
import {
  CATEGORY, candidateGroups, pickProduct, pickSealedProduct, printingMarket, sealedGroups, toQuote, type Quote,
} from "./tcgplayerMatch";

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

// ── Inventory prices (nightly job) ──
// TCGplayer market prices for inventory singles and sealed product, by item
// id. Same strict matching as everywhere else: singles by set + number (the
// printing the name asks for, else the primary one), sealed by set + the exact
// product kind. Items that don't match are left out, so the caller can fall
// back to its other sources. Japanese items (language column, or "(JP)" in the
// name or set) are priced from TCGplayer's Japanese catalog.
export type PricingItem = {
  id: string;
  name: string;
  category: string;
  set_name: string | null;
  card_number: string | null;
  product_type?: string | null;
  language?: string | null;
};

const langOf = (it: PricingItem): "en" | "ja" =>
  /^ja/i.test(it.language ?? "") || cardLang({ name: it.name, set_name: it.set_name }) === "ja" ? "ja" : "en";

export async function tcgplayerItemPrices(items: PricingItem[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();

  for (const lang of ["en", "ja"] as const) {
    const singles = items.filter((it) => it.category === "single" && langOf(it) === lang);
    if (!singles.length) continue;
    const quotes = await lookupTcgplayerQuotes(
      singles.map((it) => ({ key: it.id, name: it.name, setName: it.set_name, cardNumber: it.card_number })),
      lang,
    );
    for (const it of singles) {
      const market = quotes[it.id] ? printingMarket(quotes[it.id], it.name) : null;
      if (market != null) out.set(it.id, market);
    }
  }

  await Promise.all(items.filter((it) => it.category === "sealed").map(async (it) => {
    const lang = langOf(it);
    const category = CATEGORY[lang];
    const sealed = { name: it.name, set_name: it.set_name, product_type: it.product_type ?? null };
    for (const g of sealedGroups(sealed, await tcgGroups(category), lang)) {
      const [products, prices] = await Promise.all([tcgProducts(category, g.groupId), tcgPrices(category, g.groupId)]);
      const p = pickSealedProduct(products, sealed, g);
      if (!p) continue;
      const market = toQuote(p, prices).market;
      if (market != null) out.set(it.id, market);
      return;
    }
  }));

  return out;
}

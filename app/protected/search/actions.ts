"use server";

import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { fetchTcgdexPrice } from "@/lib/tcgdexPrice";
import { lookupTcgplayerQuotes } from "@/lib/tcgplayerPrices";
import { stripParens } from "@/lib/cardNameUtils";
import type { Printing, Quote } from "@/lib/tcgplayerMatch";
import {
  JA_ID_PREFIX, matchesCard, nameTerms, productIdOf, rankCatalog,
  type CatalogCard, type CatalogLang, type CatalogRow,
} from "./catalog";

// How many name matches to pull before ranking. Enough that a common name
// ("pikachu") still surfaces the right set once the other terms filter it.
const CANDIDATES = 400;

// ── Search ──
// English: pokemon_cards (synced weekly from TCGdex). Japanese: tcgplayer_cards
// (synced daily from TCGCSV), which lists Japanese cards under English names.
// Candidates come back newest set first, then rankCatalog orders them by match
// quality. The name lookup tries the likeliest term first and moves on when it
// finds nothing ("charizard evolutions" tries "evolutions", then "charizard").
export async function searchCatalog(query: string, lang: CatalogLang = "en"): Promise<CatalogCard[]> {
  const supabase = await createClient();
  for (const term of nameTerms(query)) {
    const { data, error } = lang === "ja"
      ? await supabase
        .from("tcgplayer_cards")
        .select("product_id,name,set_code,set_name,card_number,image_url")
        .eq("lang", "ja")
        .ilike("name", `%${term}%`)
        .order("group_id", { ascending: false })
        .limit(CANDIDATES)
      : await supabase
        .from("pokemon_cards")
        .select("id,name,set_id,set_name,card_number,image_url")
        .eq("language", "en")
        .ilike("name", `%${term}%`)
        .order("set_id", { ascending: false })
        .limit(CANDIDATES);
    if (error) throw new Error(error.message);
    const rows: CatalogRow[] = lang === "ja"
      ? (data as JaRow[] ?? []).map((r) => ({
        id: `${JA_ID_PREFIX}${r.product_id}`, name: r.name, set_id: r.set_code, set_name: r.set_name,
        card_number: r.card_number, image_url: r.image_url,
      }))
      : (data as CatalogRow[] ?? []);
    const ranked = rankCatalog(rows, query, undefined, lang);
    if (ranked.length) return ranked;
  }
  return [];
}

type JaRow = {
  product_id: number; name: string; set_code: string | null; set_name: string;
  card_number: string | null; image_url: string | null;
};

// ── Stock per result ──
// How many in-stock copies you have of each result card (tile footer). One
// read of the workspace's in-stock singles/slabs, matched in JS the same way
// the card sheet matches (name + number + set name or code).
export async function stockCounts(cards: CatalogCard[]): Promise<Record<string, number>> {
  if (!cards.length) return {};
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data, error } = await supabase
    .from("items")
    .select("id,name,set_name,card_number")
    .eq("workspace_id", workspaceId)
    .in("status", ["inventory", "grading"])
    .in("category", ["single", "slab"])
    .limit(5000);
  if (error) throw new Error(error.message);
  const out: Record<string, number> = {};
  for (const card of cards) {
    const n = (data ?? []).filter((it) => matchesCard(it, card)).length;
    if (n) out[card.id] = n;
  }
  return out;
}

// ── TCGplayer prices per result ──
// Rarity and market price per printing for each result card (tile price,
// rarity filter, price sort). English cards are matched in TCGCSV's lists;
// Japanese cards are TCGplayer products already, priced by the daily sync.
// Cards TCGplayer doesn't list are left out.
export async function priceQuotes(cards: CatalogCard[]): Promise<Record<string, Quote>> {
  const en = cards.filter((c) => c.lang !== "ja");
  const ja = cards.filter((c) => c.lang === "ja");
  const [enQuotes, jaQuotes] = await Promise.all([
    en.length
      ? lookupTcgplayerQuotes(en.map((c) => ({ key: c.id, name: c.name, setName: c.setName, cardNumber: c.cardNumber })))
      : {},
    ja.length ? storedQuotes(ja) : {},
  ]);
  return { ...enQuotes, ...jaQuotes };
}

async function storedQuotes(cards: CatalogCard[]): Promise<Record<string, Quote>> {
  const ids = cards.map(productIdOf).filter((id): id is number => id != null);
  if (!ids.length) return {};
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tcgplayer_cards")
    .select("product_id,url,rarity,market,printings")
    .in("product_id", ids);
  if (error) throw new Error(error.message);
  const out: Record<string, Quote> = {};
  for (const r of (data ?? []) as { product_id: number; url: string | null; rarity: string | null; market: number | string | null; printings: Printing[] | null }[]) {
    out[`${JA_ID_PREFIX}${r.product_id}`] = {
      productId: r.product_id,
      url: r.url,
      rarity: r.rarity,
      market: r.market == null ? null : Number(r.market),
      printings: r.printings ?? [],
    };
  }
  return out;
}

// ── Card detail ──
// The in-stock inventory items that are this card, plus its TCGplayer prices:
// per printing from TCGCSV (the same quote as its tile), else the market price
// via TCGdex (English only). `priceFailed` means the TCGdex lookup timed out or
// errored (the sheet offers Retry), as opposed to there being no price.
export type StockMatch = {
  id: string;
  grade: string | null;
  condition: string | null;
  market: number | null;
  category: string;
};

export type CardDetail = { market: number | null; priceFailed: boolean; quote: Quote | null; inStock: StockMatch[] };

// Longer than the API route's 6s: someone is waiting on this one sheet
const DETAIL_PRICE_TIMEOUT_MS = 10_000;

export async function getCardPrice(cardId: string) {
  return fetchTcgdexPrice(cardId, DETAIL_PRICE_TIMEOUT_MS);
}

export async function getCardDetail(card: CatalogCard): Promise<CardDetail> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const [price, itemsRes] = await Promise.all([
    priceQuotes([card]).then(async (q): Promise<{ quote: Quote | null; market: number | null; failed: boolean }> => {
      const quote = q[card.id] ?? null;
      if (quote || card.lang === "ja") return { quote, market: quote?.market ?? null, failed: false };
      return { quote: null, ...(await fetchTcgdexPrice(card.id, DETAIL_PRICE_TIMEOUT_MS)) };
    }),
    supabase
      .from("items")
      .select("id,name,set_name,card_number,grade,condition,market,category")
      .eq("workspace_id", workspaceId)
      .eq("status", "inventory")
      // Japanese items carry "(JP)" after the name; matchesCard has the final say
      .ilike("name", card.lang === "ja" ? `${likeEscape(stripParens(card.name))}%` : likeEscape(card.name))
      .limit(200),
  ]);
  if (itemsRes.error) throw new Error(itemsRes.error.message);

  const inStock = (itemsRes.data ?? [])
    .filter((it) => matchesCard(it, card))
    .map(({ id, grade, condition, market, category }) => ({ id, grade, condition, market, category }));

  return { market: price.market, priceFailed: price.failed, quote: price.quote, inStock };
}

// ilike treats % and _ as wildcards and \ as their escape
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);

"use server";

import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { fetchTcgdexPrice } from "@/lib/tcgdexPrice";
import { matchesCard, nameTerm, rankCatalog, type CatalogCard, type CatalogRow } from "./catalog";

// How many name matches to pull before ranking. Enough that a common name
// ("pikachu") still surfaces the right set once the other terms filter it.
const CANDIDATES = 400;

// ── Search ──
// English catalog (pokemon_cards, synced weekly from TCGdex). Candidates come
// back by set code, then rankCatalog orders them by match quality.
export async function searchCatalog(query: string): Promise<CatalogCard[]> {
  const term = nameTerm(query);
  if (!term) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pokemon_cards")
    .select("id,name,set_id,set_name,card_number,image_url")
    .eq("language", "en")
    .ilike("name", `%${term}%`)
    .order("set_id", { ascending: false })
    .limit(CANDIDATES);
  if (error) throw new Error(error.message);

  return rankCatalog((data ?? []) as CatalogRow[], query);
}

// ── Card detail ──
// The in-stock inventory items that are this card, plus its market price from
// TCGdex. `priceFailed` means the lookup timed out or errored (the sheet
// offers Retry), as opposed to TCGdex having no price for the card.
export type StockMatch = {
  id: string;
  grade: string | null;
  condition: string | null;
  market: number | null;
  category: string;
};

export type CardDetail = { market: number | null; priceFailed: boolean; inStock: StockMatch[] };

// Longer than the API route's 6s: someone is waiting on this one sheet
const DETAIL_PRICE_TIMEOUT_MS = 10_000;

export async function getCardPrice(cardId: string) {
  return fetchTcgdexPrice(cardId, DETAIL_PRICE_TIMEOUT_MS);
}

export async function getCardDetail(card: CatalogCard): Promise<CardDetail> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const [price, itemsRes] = await Promise.all([
    fetchTcgdexPrice(card.id, DETAIL_PRICE_TIMEOUT_MS),
    supabase
      .from("items")
      .select("id,name,set_name,card_number,grade,condition,market,category")
      .eq("workspace_id", workspaceId)
      .eq("status", "inventory")
      .ilike("name", card.name)
      .limit(200),
  ]);
  if (itemsRes.error) throw new Error(itemsRes.error.message);

  const inStock = (itemsRes.data ?? [])
    .filter((it) => matchesCard(it, card))
    .map(({ id, grade, condition, market, category }) => ({ id, grade, condition, market, category }));

  return { market: price.market, priceFailed: price.failed, inStock };
}

// Server-only — imported by API routes. Uses next/headers via supabase/server.
import { createClient } from "@/lib/supabase/server";
import type { ScannedCardMatch } from "@/lib/cardMatchFromScan.types";

export type { ScannedCardMatch } from "@/lib/cardMatchFromScan.types";

type ScanInput = {
  name: string;
  set_name: string;
  card_number: string;
  language?: "en" | "ja";
};

type DbCard = {
  id: string;
  name: string;
  set_id: string;
  set_name: string | null;
  card_number: string | null;
  image_url: string | null;
  market_price: number | null;
};

/**
 * Match a Claude-identified card against the local Supabase pokemon_cards table.
 *
 * Strategy:
 *  1. card_number + set_name → exact match (most precise)
 *  2. card_number + name    → number match filtered by name
 *  3. Name-only search      → ilike + scoring
 */
export async function matchScannedCard(input: ScanInput): Promise<ScannedCardMatch | null> {
  const { name, set_name, card_number, language = "en" } = input;
  if (!name) return null;

  try {
    const supabase = await createClient();

    // ── 1. card_number + set_name ─────────────────────────────────────────────
    if (card_number && set_name) {
      const numClean = card_number.replace(/^0+(\d)/, "$1").split("/")[0];
      const { data } = await supabase
        .from("pokemon_cards")
        .select("id, name, set_id, set_name, card_number, image_url, market_price")
        .eq("language", language)
        .ilike("set_name", `%${set_name}%`)
        .or(`card_number.eq.${numClean},card_number.ilike.${numClean}/%,card_number.ilike.${card_number}`)
        .ilike("name", `%${name.split(" ")[0]}%`)
        .limit(10);

      if (data?.length) {
        const best = findBestNameMatch(data, name);
        if (best) return toMatch(best);
      }
    }

    // ── 2. card_number + name ─────────────────────────────────────────────────
    if (card_number) {
      const numClean = card_number.replace(/^0+(\d)/, "$1").split("/")[0];
      const { data } = await supabase
        .from("pokemon_cards")
        .select("id, name, set_id, set_name, card_number, image_url, market_price")
        .eq("language", language)
        .or(`card_number.eq.${numClean},card_number.ilike.${numClean}/%`)
        .ilike("name", `%${name.split(" ")[0]}%`)
        .limit(20);

      if (data?.length) {
        const best = findBestNameMatch(data, name);
        if (best) return toMatch(best);
      }
    }

    // ── 3. Name-only search ───────────────────────────────────────────────────
    const queryStr = set_name ? `${name} ${set_name}`.trim() : name;
    const terms = queryStr
      .toLowerCase()
      .replace(/[',\-.]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter((t) => t.length > 0);

    if (!terms.length) return null;

    const nameTerm =
      [...terms]
        .filter((t) => /[a-z]/i.test(t))
        .sort((a, b) => b.length - a.length)[0] ?? terms[0];

    const { data } = await supabase
      .from("pokemon_cards")
      .select("id, name, set_id, set_name, card_number, image_url, market_price")
      .eq("language", language)
      .ilike("name", `%${nameTerm}%`)
      .order("name")
      .limit(40);

    if (!data?.length) return null;

    const nameTermsOnly = terms.filter((t) => !/^\d+$/.test(t));
    const filtered = data.filter((c) => {
      const searchable = [
        c.name.toLowerCase(),
        (c.set_name ?? "").toLowerCase(),
        (c.set_id ?? "").toLowerCase(),
        (c.card_number ?? "").toLowerCase(),
      ].join(" ");
      return nameTermsOnly.every((t) => searchable.includes(t));
    });

    const pool = filtered.length > 0 ? filtered : data;
    const best = findBestNameMatch(pool, name);
    if (best) return toMatch(best);

    return null;
  } catch (err) {
    console.error("[cardMatchFromScan.server] Error:", err);
    return null;
  }
}

function findBestNameMatch(cards: DbCard[], targetName: string): DbCard | null {
  if (!cards.length) return null;
  const target = targetName.toLowerCase().trim();
  const targetFirst = target.split(" ")[0];
  let best: DbCard | null = null;
  let bestScore = -1;
  for (const c of cards) {
    const cname = c.name.toLowerCase();
    let score = 0;
    if (cname === target) score += 100;
    else if (cname.startsWith(target)) score += 60;
    else if (target.startsWith(cname)) score += 40;
    else if (cname.includes(target)) score += 20;
    else if (cname.startsWith(targetFirst)) score += 10;
    else if (cname.includes(targetFirst)) score += 5;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return bestScore > 0 ? best : (cards[0] ?? null);
}

function toMatch(c: DbCard): ScannedCardMatch {
  return {
    matchedName: c.name,
    matchedSetName: c.set_name || c.set_id || "",
    matchedCardNumber: c.card_number ?? "",
    matchedImageUrl: c.image_url,
    matchedMarket: c.market_price,
    matchedCardId: c.id,
  };
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const TCGDEX_EN = "https://api.tcgdex.net/v2/en";
const TCGDEX_JA = "https://api.tcgdex.net/v2/ja";
const BATCH_SIZE = 500; // rows per upsert
const PTCG_API = "https://api.pokemontcg.io/v2";

type CardRow = {
  id: string;
  name: string;
  set_id: string;
  set_name: string | null;
  card_number: string | null;
  image_url: string | null;
  language: string;
};

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function syncLanguage(lang: "en" | "ja"): Promise<{ sets: number; cards: number; errors: string[] }> {
  const base = lang === "en" ? TCGDEX_EN : TCGDEX_JA;
  const admin = createAdminClient();
  const errors: string[] = [];
  let totalCards = 0;
  let totalSets = 0;

  // Fetch all sets
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sets: any[] = await fetchJson(`${base}/sets`);

  // Process sets in chunks to avoid holding too much in memory
  const rows: CardRow[] = [];

  for (const set of sets) {
    const setId = String(set.id ?? "");
    const setName = String(set.name ?? "");
    if (!setId) continue;

    try {
      // Skip TCG Pocket sets — their set IDs start with an uppercase letter
      if (/^[A-Z]/.test(setId)) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const setData: any = await fetchJson(`${base}/sets/${encodeURIComponent(setId)}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cards: any[] = Array.isArray(setData.cards) ? setData.cards : [];

      for (const card of cards) {
        const cardId = String(card.id ?? "");
        const localId = String(card.localId ?? "");
        if (!cardId || !card.name) continue;
        // Skip Pocket cards by image URL pattern
        if (card.image && String(card.image).includes("/tcgp/")) continue;

        rows.push({
          id: cardId,
          name: String(card.name),
          set_id: setId,
          set_name: setName || null,
          card_number: localId || null,
          image_url: card.image ? `${card.image}/high.webp` : null,
          language: lang,
        });
      }

      totalSets++;
      totalCards += cards.length;

      // Flush batch
      if (rows.length >= BATCH_SIZE) {
        const batch = rows.splice(0, BATCH_SIZE);
        const { error } = await admin.from("pokemon_cards").upsert(batch, { onConflict: "id" });
        if (error) errors.push(`Upsert error: ${error.message}`);
      }
    } catch (e) {
      errors.push(`Set ${setId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Flush remainder
  if (rows.length > 0) {
    const { error } = await admin.from("pokemon_cards").upsert(rows, { onConflict: "id" });
    if (error) errors.push(`Final upsert error: ${error.message}`);
  }

  return { sets: totalSets, cards: totalCards, errors };
}

// Enrich EN cards that have no image by querying pokemontcg.io.
// pokemontcg.io uses card IDs like "sv4pt5-6" while TCGdex uses "sv04.5-6".
// Rather than mapping IDs, we match by name + card number within the result set.
async function enrichImages(): Promise<{ updated: number; errors: string[] }> {
  const admin = createAdminClient();
  const errors: string[] = [];
  let updated = 0;

  // Fetch EN cards with no image in batches of 100
  let offset = 0;
  const PAGE = 100;
  const apiKey = process.env.POKEMON_TCG_API_KEY ?? "";

  while (true) {
    const { data, error } = await admin
      .from("pokemon_cards")
      .select("id, name, card_number, set_id")
      .eq("language", "en")
      .is("image_url", null)
      .range(offset, offset + PAGE - 1);

    if (error) { errors.push(error.message); break; }
    if (!data || data.length === 0) break;

    // Query pokemontcg.io for each card — batch by set_id groups to reduce requests
    const bySet = new Map<string, typeof data>();
    for (const card of data) {
      const key = card.set_id ?? "";
      if (!bySet.has(key)) bySet.set(key, []);
      bySet.get(key)!.push(card);
    }

    for (const [setId, cards] of bySet) {
      try {
        // Build name query: pokemontcg.io supports OR within name field
        // Use first card's name to search (names are usually unique within a set)
        for (const card of cards) {
          const q = `name:"${card.name}" number:"${card.card_number}"`;
          const headers: HeadersInit = apiKey ? { "X-Api-Key": apiKey } : {};
          const res = await fetch(
            `${PTCG_API}/cards?q=${encodeURIComponent(q)}&select=id,images&pageSize=5`,
            { cache: "no-store", headers }
          );
          if (!res.ok) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const json: any = await res.json();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const match = json.data?.find((c: any) =>
            c.id.split("-")[1] === card.card_number
          ) ?? json.data?.[0];
          if (!match?.images?.large) continue;

          const { error: upErr } = await admin
            .from("pokemon_cards")
            .update({ image_url: match.images.large })
            .eq("id", card.id);
          if (!upErr) updated++;
        }
      } catch (e) {
        errors.push(`Set ${setId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return { updated, errors };
}

export async function POST(req: NextRequest) {
  // Protect with CRON_SECRET (same key used for price refresh)
  const auth = req.headers.get("authorization") ?? "";
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  if (action === "enrich-images") {
    try {
      const result = await enrichImages();
      return NextResponse.json({ ok: true, ...result });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Enrich failed" },
        { status: 500 }
      );
    }
  }

  const lang = (searchParams.get("lang") ?? "en") as "en" | "ja";

  if (lang !== "en" && lang !== "ja") {
    return NextResponse.json({ error: "lang must be 'en' or 'ja'" }, { status: 400 });
  }

  try {
    const result = await syncLanguage(lang);
    return NextResponse.json({ ok: true, lang, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 }
    );
  }
}

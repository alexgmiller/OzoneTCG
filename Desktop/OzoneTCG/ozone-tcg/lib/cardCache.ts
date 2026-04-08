/**
 * Server-only cache helpers for card image lookups.
 * Uses two Supabase tables:
 *   card_image_cache — stores API lookup results (auto-populated)
 *   pokemon_cards    — stores manually-added images (admin-managed)
 */

import { createAdminClient } from "./supabase/admin";

/** Normalize name + set + number into a stable cache key */
export function makeLookupKey(
  name: string,
  setName?: string | null,
  cardNumber?: string | null
): string {
  const num = (cardNumber ?? "").split("/")[0].trim().toLowerCase();
  return `${name.trim().toLowerCase()}|${(setName ?? "").trim().toLowerCase()}|${num}`;
}

type CacheHit = { hit: true; imageUrl: string | null };
type CacheMiss = { hit: false };

/** Read a previous lookup from the cache. Returns hit=false if not yet cached. */
export async function getCardCache(lookupKey: string): Promise<CacheHit | CacheMiss> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("card_image_cache")
      .select("image_url")
      .eq("lookup_key", lookupKey)
      .maybeSingle();
    if (error || data === null) return { hit: false };
    return { hit: true, imageUrl: data.image_url ?? null };
  } catch {
    return { hit: false };
  }
}

/**
 * Write a lookup result to the cache.
 * Pass imageUrl=null to cache a negative result ("no image exists for this card").
 */
export async function setCardCache(
  lookupKey: string,
  name: string,
  setName: string | null,
  cardNumber: string | null,
  imageUrl: string | null,
  source: string
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("card_image_cache").upsert({
      lookup_key: lookupKey,
      name,
      set_name: setName ?? null,
      card_number: cardNumber ?? null,
      image_url: imageUrl,
      source,
      cached_at: new Date().toISOString(),
    });
  } catch {
    // Cache writes are non-critical — swallow errors silently
  }
}

/**
 * Look up a manually-added image from the pokemon_cards table.
 * Tries name + card_number first, then name alone.
 */
export async function getManualImage(
  name: string,
  cardNumber?: string | null
): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const num = (cardNumber ?? "").split("/")[0].trim();

    if (num) {
      const { data } = await admin
        .from("pokemon_cards")
        .select("image_url")
        .ilike("name", name.trim())
        .eq("card_number", num)
        .not("image_url", "is", null)
        .limit(1)
        .maybeSingle();
      if (data?.image_url) return data.image_url as string;
    }

    const { data } = await admin
      .from("pokemon_cards")
      .select("image_url")
      .ilike("name", name.trim())
      .not("image_url", "is", null)
      .limit(1)
      .maybeSingle();
    return (data?.image_url as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * Server-only cache helpers for card image lookups.
 * Uses two Supabase tables:
 *   card_image_cache — stores API lookup results (auto-populated)
 *   pokemon_cards    — stores manually-added images (admin-managed)
 */

import { createAdminClient } from "./supabase/admin";
import { normNum } from "./cardArtMatch";

/** Normalize name + set + number into a stable cache key */
export function makeLookupKey(
  name: string,
  setName?: string | null,
  cardNumber?: string | null
): string {
  const num = (cardNumber ?? "").split("/")[0].trim().toLowerCase();
  return `${name.trim().toLowerCase()}|${(setName ?? "").trim().toLowerCase()}|${num}`;
}

type CacheHit = { hit: true; imageUrl: string | null; source: string | null };
type CacheMiss = { hit: false };

/** Read a previous lookup from the cache. Returns hit=false if not yet cached. */
export async function getCardCache(lookupKey: string): Promise<CacheHit | CacheMiss> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("card_image_cache")
      .select("image_url,source")
      .eq("lookup_key", lookupKey)
      .maybeSingle();
    if (error || data === null) return { hit: false };
    return { hit: true, imageUrl: data.image_url ?? null, source: (data.source as string | null) ?? null };
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

export async function clearCacheEntry(
  name: string,
  setName?: string | null,
  cardNumber?: string | null
): Promise<void> {
  try {
    const admin = createAdminClient();
    const key = makeLookupKey(name, setName, cardNumber);
    await admin.from("card_image_cache").delete().eq("lookup_key", key);
  } catch {
    // Non-critical
  }
}

export async function findManualCacheEntry(
  name: string,
  cardNumber: string | null | undefined,
  setName?: string | null
): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const num = (cardNumber ?? "").split("/")[0].trim();

    // Same name + number in the same set: a manual pick for "Pikachu #27" in
    // one set says nothing about "Pikachu #27" in another
    if (num) {
      let q = admin
        .from("card_image_cache")
        .select("image_url")
        .ilike("name", name.trim())
        .ilike("card_number", num)
        .in("source", ["manual", "manual_admin"])
        .not("image_url", "is", null);
      if (setName) q = q.ilike("set_name", setName.trim());
      const { data } = await q.order("cached_at", { ascending: false }).limit(1).maybeSingle();
      return (data?.image_url as string) ?? null;
    }

    if (setName) {
      const { data } = await admin
        .from("card_image_cache")
        .select("image_url")
        .ilike("name", name.trim())
        .ilike("set_name", setName.trim())
        .in("source", ["manual", "manual_admin"])
        .not("image_url", "is", null)
        .order("cached_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.image_url) return data.image_url as string;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Art for this exact card from the synced catalog (pokemon_cards): same name
 * and number, in one of the item's TCGdex sets (`setIds`, from
 * cardArtMatch.resolveSetIds). With no known set, only a single printing with
 * that number counts. No number → null: a name alone can't pick the printing.
 */
export async function getManualImage(
  name: string,
  cardNumber: string | null | undefined,
  setIds: string[],
): Promise<string | null> {
  try {
    const want = normNum(cardNumber);
    if (!want) return null;
    const admin = createAdminClient();
    const { data } = await admin
      .from("pokemon_cards")
      .select("set_id,card_number,image_url")
      .ilike("name", name.trim())
      .not("image_url", "is", null)
      .limit(200);
    const hits = (data ?? []).filter((c) => normNum(c.card_number as string | null) === want);
    if (setIds.length) {
      const sets = new Set(setIds.map((s) => s.toLowerCase()));
      const inSet = hits.find((c) => sets.has(String(c.set_id ?? "").toLowerCase()));
      return (inSet?.image_url as string) ?? null;
    }
    return hits.length === 1 ? (hits[0].image_url as string) : null;
  } catch {
    return null;
  }
}

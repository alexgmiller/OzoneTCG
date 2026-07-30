/**
 * Helpers for the card_images table — the authoritative image store.
 *
 * Lookup priority in pokemonPriceTracker.ts:
 *   0. card_images (this file) ← new
 *   1. card_image_cache (existing fast-lookup cache)
 *   2. TCGdex API
 *   3. pokemontcg.io API
 *   4. negative cache
 */

import { createAdminClient } from "./supabase/admin";

// Query errors must be visible — a missing table sat undetected for months
// because results were destructured as { data } only. The missing-table case
// is logged once per process to avoid spamming every lookup.
let missingTableWarned = false;
export function logQueryError(where: string, error: { message: string } | null | undefined): void {
  if (!error) return;
  const isMissingTable = error.message.includes("does not exist");
  if (isMissingTable) {
    if (missingTableWarned) return;
    missingTableWarned = true;
    console.error(
      `[cardImages] ${where}: ${error.message} — run migrations/20240420_card_images.sql (see migrations/README.md)`
    );
    return;
  }
  console.error(`[cardImages] ${where} query error:`, error.message);
}

export type CardImageRow = {
  lookup_key: string;
  name: string;
  set_name: string | null;
  card_number: string | null;
  image_url: string | null;
  source: string | null;
  cached_at: string;
};

export type CardImageUpsert = {
  card_name: string;
  set_name: string;
  card_number?: string | null;
  language?: string;
  category?: "single" | "slab" | "sealed";
  variant?: string | null;
  product_type?: string | null;
  grading_company?: string | null;
  image_url: string;
  thumbnail_url?: string | null;
  source?: string;
  verified?: boolean;
};

// ── Lookups ───────────────────────────────────────────────────────────────────

/**
 * Look up an image from card_images.
 * Tries most-specific match first, relaxes constraints progressively.
 */
type ImageHit = { imageUrl: string; thumbnailUrl: string | null; verified: boolean; id: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToHit(row: any): ImageHit | null {
  if (!row?.image_url) return null;
  return {
    imageUrl: row.image_url as string,
    thumbnailUrl: (row.thumbnail_url as string | null) ?? null,
    verified: row.verified as boolean,
    id: row.id as string,
  };
}

export async function getCardImage(
  cardName: string,
  setName: string | null,
  cardNumber: string | null,
  language: "English" | "Japanese" | "Chinese" = "English",
  category: "single" | "slab" | "sealed" = "single",
  variant?: string | null
): Promise<ImageHit | null> {
  try {
    const admin = createAdminClient();
    const num = (cardNumber ?? "").split("/")[0].trim() || null;
    const name = cardName.trim();
    const SELECT = "id,image_url,thumbnail_url,verified";

    // 1. Exact: name + set + number + language + category + variant
    if (variant && setName && num) {
      const { data, error } = await admin.from("card_images").select(SELECT)
        .ilike("card_name", name).ilike("set_name", setName)
        .eq("card_number", num).eq("language", language).eq("category", category)
        .eq("variant", variant).limit(1);
      logQueryError("getCardImage#1", error);
      const hit = rowToHit(Array.isArray(data) ? data[0] : null);
      if (hit) return hit;
    }

    // 2. name + set + number + language + category (any variant)
    if (setName && num) {
      const { data, error } = await admin.from("card_images").select(SELECT)
        .ilike("card_name", name).ilike("set_name", setName)
        .eq("card_number", num).eq("language", language).eq("category", category)
        .limit(1);
      logQueryError("getCardImage#2", error);
      const hit = rowToHit(Array.isArray(data) ? data[0] : null);
      if (hit) return hit;
    }

    // 3. name + number (any set)
    if (num) {
      const { data, error } = await admin.from("card_images").select(SELECT)
        .ilike("card_name", name).eq("card_number", num)
        .eq("language", language).eq("category", category).limit(1);
      logQueryError("getCardImage#3", error);
      const hit = rowToHit(Array.isArray(data) ? data[0] : null);
      if (hit) return hit;
    }

    // 4. name + set (no number)
    if (setName) {
      const { data, error } = await admin.from("card_images").select(SELECT)
        .ilike("card_name", name).ilike("set_name", setName)
        .eq("language", language).eq("category", category).limit(1);
      logQueryError("getCardImage#4", error);
      const hit = rowToHit(Array.isArray(data) ? data[0] : null);
      if (hit) return hit;
    }

    // 5. name only
    {
      const { data, error } = await admin.from("card_images").select(SELECT)
        .ilike("card_name", name).eq("language", language).eq("category", category).limit(1);
      logQueryError("getCardImage#5", error);
      const hit = rowToHit(Array.isArray(data) ? data[0] : null);
      if (hit) return hit;
    }

    // 6. Cross-language fallback (lower confidence — for display only)
    if (language !== "English") {
      const { data, error } = await admin.from("card_images").select(SELECT)
        .ilike("card_name", name).eq("category", category).limit(1);
      logQueryError("getCardImage#6", error);
      const hit = rowToHit(Array.isArray(data) ? data[0] : null);
      if (hit) return hit;
    }

    return null;
  } catch {
    return null;
  }
}

// ── Writes ────────────────────────────────────────────────────────────────────

export async function upsertCardImage(row: CardImageUpsert): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("card_images").upsert(
      {
        card_name: row.card_name,
        set_name: row.set_name,
        card_number: row.card_number ?? null,
        language: row.language ?? "English",
        category: row.category ?? "single",
        variant: row.variant ?? null,
        product_type: row.product_type ?? null,
        grading_company: row.grading_company ?? null,
        image_url: row.image_url,
        thumbnail_url: row.thumbnail_url ?? null,
        source: row.source ?? null,
        verified: row.verified ?? false,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "card_name,set_name,card_number,language,category,variant",
        ignoreDuplicates: false,
      }
    );
  } catch (e) {
    console.error("[cardImages] upsert failed:", e instanceof Error ? e.message : e);
  }
}

export async function verifyCardImage(imageId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("card_images")
    .update({ verified: true, updated_at: new Date().toISOString() })
    .eq("id", imageId);
}

export async function replaceCardImageUrl(
  imageId: string,
  newUrl: string,
  thumbnailUrl: string | null,
  source: string
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("card_images")
    .update({
      image_url: newUrl,
      thumbnail_url: thumbnailUrl,
      source,
      verified: true,
      flagged: false,
      flag_count: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", imageId);
}

export async function dismissImageFlag(imageId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("card_images")
    .update({ flagged: false, flag_count: 0, verified: true, updated_at: new Date().toISOString() })
    .eq("id", imageId);
}

export async function flagImage(imageId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.rpc("increment_image_flag_count", { image_id: imageId });
  } catch {
    // Non-critical
  }
}

// ── Storage upload helper ─────────────────────────────────────────────────────

/**
 * Upload an image file to the card-images Supabase Storage bucket.
 * Returns the public URL.
 * Path format: {language}/{set_slug}/{card_number}_{variant_slug}.{ext}
 */
export async function uploadImageToStorage(
  file: File | Blob,
  language: string,
  setName: string,
  cardNumber: string | null,
  variant: string | null,
  ext: string = "webp"
): Promise<string> {
  const admin = createAdminClient();

  function slug(s: string) {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  const setSlug = slug(setName);
  const numPart = cardNumber ? cardNumber.replace(/\//g, "-") : "no-number";
  const varPart = variant ? `_${slug(variant)}` : "";
  const path = `${slug(language)}/${setSlug}/${numPart}${varPart}.${ext}`;

  const { error } = await admin.storage
    .from("card-images")
    .upload(path, file, { upsert: true, contentType: `image/${ext}` });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = admin.storage.from("card-images").getPublicUrl(path);
  return data.publicUrl;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export type CardImageStats = {
  total: number;
  verified: number;
  unverified: number;
  flagged: number;
  byCategory: { single: number; slab: number; sealed: number };
  byLanguage: { English: number; Japanese: number; Chinese: number; other: number };
  notFoundCached: number;
};

export async function getCardImageStats(): Promise<CardImageStats> {
  const admin = createAdminClient();

  const ciCount = (apply: (q: ReturnType<ReturnType<typeof admin.from>["select"]>) => typeof q) =>
    apply(admin.from("card_images").select("id", { count: "exact", head: true }));

  const [totalRes, notFoundRes, ciTotal, verifiedRes, flaggedRes, singleRes, slabRes, sealedRes, enRes, jaRes, zhRes] =
    await Promise.all([
      admin.from("card_image_cache").select("lookup_key", { count: "exact", head: true }).neq("source", "not_found"),
      admin.from("card_image_cache").select("lookup_key", { count: "exact", head: true }).eq("source", "not_found"),
      ciCount((q) => q),
      ciCount((q) => q.eq("verified", true)),
      ciCount((q) => q.eq("flagged", true)),
      ciCount((q) => q.eq("category", "single")),
      ciCount((q) => q.eq("category", "slab")),
      ciCount((q) => q.eq("category", "sealed")),
      ciCount((q) => q.eq("language", "English")),
      ciCount((q) => q.eq("language", "Japanese")),
      ciCount((q) => q.eq("language", "Chinese")),
    ]);

  logQueryError("getCardImageStats/cache", totalRes.error);
  // One representative check for card_images — if the table is missing all
  // card_images counts fail identically and gracefully degrade to zeros
  logQueryError("getCardImageStats/card_images", ciTotal.error);

  const ci = ciTotal.count ?? 0;
  const en = enRes.count ?? 0;
  const ja = jaRes.count ?? 0;
  const zh = zhRes.count ?? 0;

  return {
    total: totalRes.count ?? 0,
    verified: verifiedRes.count ?? 0,
    unverified: ci - (verifiedRes.count ?? 0),
    flagged: flaggedRes.count ?? 0,
    byCategory: {
      single: singleRes.count ?? 0,
      slab: slabRes.count ?? 0,
      sealed: sealedRes.count ?? 0,
    },
    byLanguage: { English: en, Japanese: ja, Chinese: zh, other: Math.max(0, ci - en - ja - zh) },
    notFoundCached: notFoundRes.count ?? 0,
  };
}

#!/usr/bin/env tsx
/**
 * Phase 1 bulk import — populates card_images from pokemontcg.io.
 *
 * Does NOT download or re-host images yet.  Stores the pokemontcg.io CDN URL
 * directly in card_images.image_url.  Run a separate "mirror" script later to
 * download + convert to WebP + upload to Supabase Storage.
 *
 * Usage:
 *   npx tsx scripts/import-card-images.ts
 *
 * Required env vars (set in .env.local or export them before running):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   POKEMON_TCG_IO_API_KEY   (optional but strongly recommended — 1000 req/day without it)
 *
 * Options:
 *   --set <set-id>    import only this pokemontcg.io set ID (e.g. sv4pt5)
 *   --page <n>        start from page n (for resuming interrupted runs)
 *   --dry-run         print what would be inserted without writing to DB
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";

// ── Load .env.local ───────────────────────────────────────────────────────────

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

// ── Validate env ──────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PTCG_KEY     = process.env.POKEMON_TCG_IO_API_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing required env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// ── Parse CLI args ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const setFilter  = args.includes("--set")     ? args[args.indexOf("--set") + 1]  : null;
const startPage  = args.includes("--page")    ? parseInt(args[args.indexOf("--page") + 1], 10) : 1;
const dryRun     = args.includes("--dry-run");

// ── Constants ─────────────────────────────────────────────────────────────────

const PTCG_BASE    = "https://api.pokemontcg.io/v2";
const PAGE_SIZE    = 250; // pokemontcg.io max
const BATCH_SIZE   = 500; // rows per Supabase upsert
const RATE_LIMIT_MS = 1100; // ~1 req/s to be respectful

// ── Supabase client ───────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!);

// ── Types ─────────────────────────────────────────────────────────────────────

type PtcgCard = {
  id: string;
  name: string;
  number: string;
  set: { id: string; name: string };
  images: { small?: string; large?: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subtypes?: string[];
};

type CardImageRow = {
  card_name: string;
  set_name: string;
  card_number: string | null;
  language: string;
  category: string;
  variant: string | null;
  image_url: string;
  thumbnail_url: string | null;
  source: string;
  verified: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Map pokemontcg.io subtypes to our variant labels */
function resolveVariant(subtypes?: string[]): string | null {
  if (!subtypes?.length) return "Normal";
  if (subtypes.includes("Holo Rare")) return "Holo";
  if (subtypes.includes("Reverse Holo")) return "Reverse Holo";
  if (subtypes.includes("1st Edition")) return "1st Edition";
  if (subtypes.includes("Full Art")) return "Full Art";
  if (subtypes.includes("Secret Rare")) return "Secret Rare";
  if (subtypes.includes("Special Illustration Rare")) return "Special Illustration Rare";
  if (subtypes.includes("Ultra Rare")) return "Ultra Rare";
  if (subtypes.includes("Rare")) return "Holo";
  return "Normal";
}

/** Fetch a single page of cards from pokemontcg.io */
async function fetchPage(page: number, filterSetId?: string | null): Promise<{ cards: PtcgCard[]; totalCount: number }> {
  const params = new URLSearchParams({
    pageSize: String(PAGE_SIZE),
    page: String(page),
    select: "id,name,number,set,images,subtypes",
  });
  if (filterSetId) params.set("q", `set.id:${filterSetId}`);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (PTCG_KEY) headers["X-Api-Key"] = PTCG_KEY;

  const res = await fetch(`${PTCG_BASE}/cards?${params}`, { headers });
  if (!res.ok) throw new Error(`pokemontcg.io ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return { cards: json.data ?? [], totalCount: json.totalCount ?? 0 };
}

/** Upsert a batch of rows into card_images */
async function upsertBatch(rows: CardImageRow[]): Promise<{ inserted: number; errors: string[] }> {
  if (dryRun) {
    console.log(`  [DRY RUN] Would upsert ${rows.length} rows`);
    return { inserted: rows.length, errors: [] };
  }

  const { error } = await supabase
    .from("card_images")
    .upsert(rows, { onConflict: "card_name,set_name,card_number,language,category,variant", ignoreDuplicates: true });

  if (error) {
    return { inserted: 0, errors: [error.message] };
  }
  return { inserted: rows.length, errors: [] };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  OzoneTCG — pokemontcg.io bulk image import");
  console.log("═══════════════════════════════════════════════════");
  if (dryRun)     console.log("  [DRY RUN mode — no DB writes]");
  if (setFilter)  console.log(`  Set filter: ${setFilter}`);
  if (startPage > 1) console.log(`  Resuming from page ${startPage}`);
  console.log();

  let page = startPage;
  let totalImported = 0;
  let totalSkipped  = 0;
  let totalErrors   = 0;
  let totalCards    = 0;

  const buffer: CardImageRow[] = [];

  while (true) {
    process.stdout.write(`Fetching page ${page}...`);

    let cards: PtcgCard[];
    let fetchedTotal: number;
    try {
      const result = await fetchPage(page, setFilter);
      cards = result.cards;
      fetchedTotal = result.totalCount;
    } catch (e) {
      console.error(`\nFetch error on page ${page}:`, e instanceof Error ? e.message : e);
      console.error("Retry in 10s...");
      await sleep(10_000);
      continue;
    }

    if (page === startPage) {
      totalCards = fetchedTotal;
      const totalPages = Math.ceil(fetchedTotal / PAGE_SIZE);
      console.log(`\nTotal cards: ${totalCards.toLocaleString()} across ${totalPages} pages`);
      console.log();
    }

    console.log(` ${cards.length} cards`);

    for (const card of cards) {
      const imageUrl = card.images?.large ?? card.images?.small ?? null;
      if (!imageUrl) { totalSkipped++; continue; }

      buffer.push({
        card_name:     card.name,
        set_name:      card.set?.name ?? "",
        card_number:   card.number ?? null,
        language:      "English",
        category:      "single",
        variant:       resolveVariant(card.subtypes),
        image_url:     imageUrl,
        thumbnail_url: card.images?.small ?? null,
        source:        "pokemontcg.io",
        verified:      false,
      });
    }

    // Flush buffer when full
    if (buffer.length >= BATCH_SIZE) {
      const batch = buffer.splice(0, BATCH_SIZE);
      const { inserted, errors } = await upsertBatch(batch);
      totalImported += inserted;
      totalErrors   += errors.length;
      if (errors.length) console.error("  Upsert errors:", errors);
      console.log(`  ✓ Flushed batch — ${totalImported.toLocaleString()} total imported so far`);
    }

    if (cards.length < PAGE_SIZE) break; // last page
    page++;
    await sleep(RATE_LIMIT_MS);
  }

  // Flush remainder
  if (buffer.length > 0) {
    const { inserted, errors } = await upsertBatch(buffer);
    totalImported += inserted;
    totalErrors   += errors.length;
    if (errors.length) console.error("  Final upsert errors:", errors);
  }

  console.log();
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Done!`);
  console.log(`  Imported : ${totalImported.toLocaleString()}`);
  console.log(`  Skipped  : ${totalSkipped.toLocaleString()}  (no image URL)`);
  console.log(`  Errors   : ${totalErrors}`);
  console.log("═══════════════════════════════════════════════════");
  console.log();
  console.log("Next steps:");
  console.log("  • Run with --set <id> to import a specific set");
  console.log("  • Use the admin page at /protected/admin/images to upload JP/CN/sealed images");
  console.log("  • Run the mirror script later to download + re-host images locally");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});

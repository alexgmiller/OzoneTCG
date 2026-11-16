import { createAdminClient } from "@/lib/supabase/admin";
import { tcgGroups, tcgPrices, tcgProducts } from "@/lib/tcgcsv";
import { CATEGORY, toCatalogEntry, type CatalogEntry } from "@/lib/tcgplayerMatch";

// ── TCGplayer catalog sync (tcgplayer_cards) ──
// Every card TCGCSV lists for a language, with English names, rarity, number,
// image and prices per printing: the catalog behind Search's Japanese tab.
// Runs daily (/api/cron/sync-tcgplayer). TCGCSV refreshes once a day, and
// lib/tcgcsv.ts keeps at most 8 downloads in flight.
//
// A group whose price list didn't load is still synced, without price
// fields, so a failed download never blanks prices already stored.

const BATCH = 1000; // rows per upsert

export type SyncTcgplayerResult = {
  groups: number;
  /** Groups with no products: empty upstream, or the download failed */
  emptyGroups: number;
  cards: number;
  /** Cards synced without prices (their group's price list was empty or failed) */
  unpriced: number;
  errors: string[];
  ms: number;
  /** write: false only, a few rows to eyeball */
  sample?: CatalogEntry[];
};

export async function syncTcgplayer(lang: "ja", { write = true } = {}): Promise<SyncTcgplayerResult> {
  const started = Date.now();
  const category = CATEGORY[lang];
  const groups = await tcgGroups(category);
  if (!groups.length) throw new Error("TCGCSV's group list didn't load");

  const now = new Date().toISOString();
  const priced: CatalogEntry[] = [];
  const unpriced: CatalogEntry[] = [];
  let emptyGroups = 0;

  await Promise.all(groups.map(async (g) => {
    const [products, prices] = await Promise.all([tcgProducts(category, g.groupId), tcgPrices(category, g.groupId)]);
    if (!products.length) { emptyGroups++; return; }
    const list = prices.length ? prices : null;
    for (const p of products) {
      const row = toCatalogEntry(p, g, lang, list, now);
      if (row) (list ? priced : unpriced).push(row);
    }
  }));

  const errors: string[] = [];
  if (write) {
    const admin = createAdminClient();
    // Same keys within each call: unpriced rows leave market/printings alone
    for (const rows of [priced, unpriced]) {
      for (let i = 0; i < rows.length; i += BATCH) {
        const { error } = await admin
          .from("tcgplayer_cards")
          .upsert(rows.slice(i, i + BATCH), { onConflict: "product_id", defaultToNull: false });
        if (error) errors.push(`Upsert ${i}–${i + BATCH}: ${error.message}`);
      }
    }
  }

  return {
    groups: groups.length,
    emptyGroups,
    cards: priced.length + unpriced.length,
    unpriced: unpriced.length,
    errors,
    ms: Date.now() - started,
    ...(write ? {} : { sample: [...priced.slice(0, 3), ...unpriced.slice(0, 2)] }),
  };
}

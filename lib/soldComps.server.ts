// Server-only — writes fetched eBay sold sales into the sold_comps table so
// momentum (30d vs 90d medians) accumulates history with every price lookup.
// Fail-soft by design: ingestion problems must never break a price fetch.
import { createAdminClient } from "@/lib/supabase/admin";
import { makeSlabPriceKey, type SlabSale } from "@/lib/ebay-client";

/** Extract the numeric eBay item id from an item URL, for dedup. */
function externalIdFromUrl(itemUrl: string): string | null {
  const m = itemUrl.match(/\/itm\/(\d+)/);
  return m ? m[1] : null;
}

/**
 * Ingest sold sales as comps under a canonical comp_key.
 *
 * comp_key deliberately omits set name (makeSlabPriceKey with null set):
 * most fetch paths don't have the set, and a mixed keying scheme would
 * fragment the comp pool. name + card number + company + grade is unique
 * enough in practice (the collector number encodes the set).
 *
 * Only sales with a stable eBay item id are ingested — rows without one
 * can't be deduped across re-fetches and would pollute the medians.
 * Pure best-offer sales are excluded (negotiated price unknown), matching
 * the FMV pipeline's filtering.
 */
export async function ingestSoldComps(params: {
  name: string;
  company: string;
  grade: string;
  cardNumber?: string | null;
  sales: SlabSale[];
  source: string; // 'insights' | 'ebay_scraper'
}): Promise<void> {
  try {
    const compKey = makeSlabPriceKey(params.name, null, params.cardNumber, params.company, params.grade);

    const candidates = params.sales
      .map((s) => ({ sale: s, externalId: externalIdFromUrl(s.itemUrl) }))
      .filter(
        ({ sale, externalId }) =>
          externalId != null &&
          sale.price > 1 &&
          !sale.isBestOffer &&
          sale.soldDate &&
          !isNaN(Date.parse(sale.soldDate)),
      );
    if (candidates.length === 0) return;

    const admin = createAdminClient();

    // Dedup against prior fetches (partial unique index on source+external_id
    // isn't usable as an upsert conflict target through PostgREST)
    const ids = candidates.map((c) => c.externalId!);
    const { data: existing, error: selectError } = await admin
      .from("sold_comps")
      .select("external_id")
      .eq("source", params.source)
      .in("external_id", ids);
    if (selectError) {
      console.error("[soldComps] dedup query failed:", selectError.message);
      return;
    }
    const seen = new Set((existing ?? []).map((r) => r.external_id));

    const rows = candidates
      .filter((c) => !seen.has(c.externalId))
      .map(({ sale, externalId }) => ({
        comp_key: compKey,
        sold_price: sale.price,
        sold_date: new Date(sale.soldDate).toISOString(),
        source: params.source,
        external_id: externalId,
      }));
    if (rows.length === 0) return;

    const { error: insertError } = await admin.from("sold_comps").insert(rows);
    if (insertError) {
      console.error("[soldComps] insert failed:", insertError.message);
      return;
    }
    console.log(`[soldComps] ingested ${rows.length} comps for ${compKey} (${params.source})`);
  } catch (err) {
    console.error("[soldComps] ingest error:", err);
  }
}

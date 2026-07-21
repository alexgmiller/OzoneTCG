// Server-only — snapshots PSA population counts into pop_snapshots so
// population growth (scarcity signal for the buy/pass score) accumulates
// with every cert lookup. Fail-soft: never breaks the lookup flow.
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Canonical pop_key: '<COMPANY>|<name>|<base card number>'.
 * Set-less on purpose, mirroring sold_comps comp_key — the collector number
 * encodes the set, and most lookup paths don't have a clean set name.
 */
export function makePopKey(company: string, name: string, cardNumber?: string | null): string {
  const num = (cardNumber ?? "").split("/")[0].trim().toLowerCase();
  return [company.toUpperCase(), name.toLowerCase().trim(), num].join("|");
}

export async function snapshotPopulation(params: {
  company: string;
  name: string;
  cardNumber?: string | null;
  grade: string;
  population: number;
  populationHigher?: number | null;
}): Promise<void> {
  try {
    if (!params.name || !params.grade || params.population < 0) return;

    const admin = createAdminClient();
    const { error } = await admin.from("pop_snapshots").upsert(
      {
        pop_key: makePopKey(params.company, params.name, params.cardNumber),
        grade: params.grade,
        population: params.population,
        higher_pop: params.populationHigher ?? null,
        snapshot_date: new Date().toISOString().slice(0, 10),
        source: params.company.toLowerCase(),
      },
      { onConflict: "pop_key,grade,snapshot_date,source" },
    );
    if (error) console.error("[popSnapshots] upsert failed:", error.message);
  } catch (err) {
    console.error("[popSnapshots] snapshot error:", err);
  }
}

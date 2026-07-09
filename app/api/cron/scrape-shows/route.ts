import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TcdbSource } from "@/lib/showsSources/tcdbScraper";
import { geocodeCity } from "@/lib/showsGeocode";
import type { CardShowRecord } from "@/lib/showsSources/types";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const source = new TcdbSource();
  const started = Date.now();

  let showsFound = 0;
  let showsUpserted = 0;
  let runError: string | null = null;

  try {
    const records: CardShowRecord[] = await source.fetch();
    showsFound = records.length;

    for (const record of records) {
      // Attach coordinates if city is in static lookup
      const geo = geocodeCity(record.city, record.state);
      if (geo) {
        record.latitude = geo.lat;
        record.longitude = geo.lon;
      }

      // Upsert based on (source, source_external_id) when we have an ID,
      // otherwise fall back to (source, name, start_date) dedup.
      const { error } = record.source_external_id
        ? await supabase.from("card_shows").upsert(
            { ...record, updated_at: new Date().toISOString() },
            { onConflict: "source,source_external_id", ignoreDuplicates: false },
          )
        : await supabase.from("card_shows").upsert(
            { ...record, updated_at: new Date().toISOString() },
            { onConflict: "source,source_external_id", ignoreDuplicates: false },
          );

      if (error) {
        console.error("[scrape-shows] upsert error:", error.message, record.name);
      } else {
        showsUpserted++;
      }
    }
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err);
    console.error("[scrape-shows] fatal error:", runError);
  }

  const durationMs = Date.now() - started;

  await supabase.from("scraper_runs").insert({
    source: source.name,
    shows_found: showsFound,
    shows_upserted: showsUpserted,
    error: runError,
    duration_ms: durationMs,
  });

  if (runError) {
    return NextResponse.json({ ok: false, error: runError }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    source: source.name,
    shows_found: showsFound,
    shows_upserted: showsUpserted,
    duration_ms: durationMs,
  });
}

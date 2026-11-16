import { NextRequest, NextResponse } from "next/server";
import { syncTcgplayer } from "@/lib/catalog/syncTcgplayer";

// ~460 Japanese sets × (products + prices) from TCGCSV, then upserts
export const maxDuration = 300;

// Daily TCGplayer catalog sync (vercel.json: 04:00 UTC, after TCGCSV's daily
// refresh): fills tcgplayer_cards for Search's Japanese tab.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncTcgplayer("ja");
    console.log(`[sync-tcgplayer] ja: ${result.cards} cards (${result.unpriced} unpriced) from ${result.groups} sets in ${result.ms}ms; ${result.errors.length} errors`);
    return NextResponse.json({ ok: result.errors.length === 0, lang: "ja", ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 },
    );
  }
}

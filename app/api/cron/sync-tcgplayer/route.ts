import { NextRequest, NextResponse } from "next/server";
import { syncTcgplayer } from "@/lib/catalog/syncTcgplayer";
import { syncProblem } from "@/lib/catalog/tcgplayerSyncStatus";

// ~460 Japanese sets × (products + prices) from TCGCSV, then upserts
export const maxDuration = 300;

// Daily TCGplayer catalog sync (vercel.json: 04:00 UTC, after TCGCSV's daily
// refresh): fills tcgplayer_cards for Search's Japanese tab. A run that saved
// nothing or lost many sets answers 500, so Vercel shows it as failed.
// Settings → Pricing Sources → Sync now runs the same sync by hand.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncTcgplayer("ja");
    const problem = syncProblem(result);
    console.log(`[sync-tcgplayer] ja: ${result.cards} cards (${result.unpriced} unpriced) from ${result.groups} sets (${result.emptyGroups} empty) in ${result.ms}ms; ${problem ?? "ok"}`);
    return NextResponse.json({ ok: !problem, problem, lang: "ja", ...result }, { status: problem ? 500 : 200 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 },
    );
  }
}

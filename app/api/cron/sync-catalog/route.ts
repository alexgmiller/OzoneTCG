import { NextRequest, NextResponse } from "next/server";
import { enrichImages, syncCatalog, syncLanguage } from "@/lib/catalog/syncCatalog";

// Two languages × every set is a long walk of the TCGdex API (Vercel Pro required for >60s)
export const maxDuration = 300;

// Weekly catalog sync (vercel.json: Mondays 05:00). Manual overrides:
//   ?lang=en|ja            sync one language only
//   ?action=enrich-images  backfill missing EN images from pokemontcg.io
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);

  try {
    if (searchParams.get("action") === "enrich-images") {
      return NextResponse.json({ ok: true, ...(await enrichImages()) });
    }

    const lang = searchParams.get("lang");
    if (lang === "en" || lang === "ja") {
      return NextResponse.json({ ok: true, lang, ...(await syncLanguage(lang)) });
    }
    if (lang) {
      return NextResponse.json({ error: "lang must be 'en' or 'ja'" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, ...(await syncCatalog()) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";

const TCGDEX_EN = "https://api.tcgdex.net/v2/en";
const TCGDEX_JA = "https://api.tcgdex.net/v2/ja";

export async function POST(req: NextRequest) {
  const { cardId } = await req.json();
  if (!cardId) return NextResponse.json({ market: null });

  // Pocket card IDs start with uppercase — they have no TCGPlayer pricing
  if (/^[A-Z]/.test(cardId)) return NextResponse.json({ market: null });

  // JP cards go to the JA endpoint
  const endpoint = TCGDEX_EN;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${endpoint}/cards/${encodeURIComponent(cardId)}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return NextResponse.json({ market: null });

    const card = await res.json();
    const p = card?.pricing?.tcgplayer;
    const market =
      p?.normal?.marketPrice ??
      p?.holofoil?.marketPrice ??
      p?.reverseHolofoil?.marketPrice ??
      null;

    return NextResponse.json({ market });
  } catch {
    return NextResponse.json({ market: null });
  }
}

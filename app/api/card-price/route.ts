import { NextRequest, NextResponse } from "next/server";
import { fetchTcgdexMarket } from "@/lib/tcgdexPrice";

// TCGplayer market price for a catalog card (TCGdex). The lookup itself lives
// in lib/tcgdexPrice so Search's card detail uses the same code.
export async function POST(req: NextRequest) {
  const { cardId } = await req.json();
  if (!cardId) return NextResponse.json({ market: null });
  return NextResponse.json({ market: await fetchTcgdexMarket(String(cardId)) });
}

import { NextRequest, NextResponse } from "next/server";
import { searchBaseNames, nameVariants, isJapaneseName, extractEmbeddedNumber } from "@/lib/cardNameUtils";

const TCGDEX_EN = "https://api.tcgdex.net/v2/en";
const TCGDEX_JA = "https://api.tcgdex.net/v2/ja";
const FETCH_TIMEOUT_MS = 8000;

type SearchResult = {
  name: string;
  setName: string;
  cardNumber: string;
  imageUrl: string | null;
  market: null;
};

function baseNumber(n: string | null | undefined): string | undefined {
  if (!n) return undefined;
  return n.split("/")[0].trim() || undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toResult(card: any): SearchResult {
  return {
    name: card.name ?? "",
    setName: card.set?.name ?? "",
    cardNumber: card.localId ?? "",
    imageUrl: card.image ? `${card.image}/high.webp` : null,
    market: null,
  };
}

async function fetchTcgDex(params: string, baseUrl = TCGDEX_EN, year?: string): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = `${baseUrl}/cards?${params}`;
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtered = data.filter((card: any) => {
      const setId = String(card.set?.id ?? "").toLowerCase();
      const setSeries = String(card.set?.series ?? "").toLowerCase();
      // Exclude TCG Pocket cards — by set ID prefix or series name
      if (setId.startsWith("tcgp") || setSeries.includes("pocket")) return false;
      // Optional year filter — match against set releaseDate (format: "YYYY/MM/DD")
      if (year && card.set?.releaseDate) {
        if (!String(card.set.releaseDate).startsWith(year)) return false;
      }
      return true;
    });
    // Limit per-query results to avoid huge payloads
    return filtered.slice(0, 20).map(toResult);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  const { name, setName, cardNumber, year } = await req.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Use explicit card number, or fall back to a number embedded in the name like "Gengar (20)"
  const num = baseNumber(cardNumber) ?? extractEmbeddedNumber(name.trim()) ?? undefined;
  const sn = setName?.trim() || undefined;
  const isJP = isJapaneseName(name);

  // Build queries across all candidate base names × case variants, most specific first
  const queries: string[] = [];
  for (const baseName of searchBaseNames(name.trim())) {
    for (const n of nameVariants(baseName)) {
      const en = encodeURIComponent(n);
      if (num && sn) {
        queries.push(`name=eq:${en}&set.name=${encodeURIComponent(sn)}&localId=${encodeURIComponent(num)}`);
        queries.push(`name=eq:${en}&set.name=${encodeURIComponent(sn)}`);
        queries.push(`name=eq:${en}&localId=${encodeURIComponent(num)}`);
      } else if (sn) {
        queries.push(`name=eq:${en}&set.name=${encodeURIComponent(sn)}`);
      } else if (num) {
        queries.push(`name=eq:${en}&localId=${encodeURIComponent(num)}`);
      }
      // Name-only fallbacks — always try these (the name= filter without eq: does partial matching)
      queries.push(`name=eq:${en}`);
      queries.push(`name=${en}`);
    }
  }

  const yearFilter = year?.trim().match(/^\d{4}$/) ? year.trim() : undefined;
  // For JP cards: try JP endpoint first, then EN as fallback to surface any available images
  const endpoints = isJP ? [TCGDEX_JA, TCGDEX_EN] : [TCGDEX_EN];

  const seen = new Set<string>();
  const merged: SearchResult[] = [];

  for (const endpoint of endpoints) {
    if (merged.length >= 24) break;
    const allResults = await Promise.all(queries.map((q) => fetchTcgDex(q, endpoint, yearFilter)));
    for (const results of allResults) {
      for (const r of results) {
        const key = `${r.name}|${r.setName}|${r.cardNumber}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(r);
          if (merged.length >= 24) break;
        }
      }
      if (merged.length >= 24) break;
    }
  }

  return NextResponse.json({ cards: merged });
}

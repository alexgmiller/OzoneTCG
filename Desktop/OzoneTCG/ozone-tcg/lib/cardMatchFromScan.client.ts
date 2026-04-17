// Client-safe — no server-only imports. Uses fetch to call /api/search-cards.
import type { OcrCardResult } from "@/lib/ocrCardReader";
import type { ScannedCardMatch, OcrMatchResult } from "@/lib/cardMatchFromScan.types";

export type { ScannedCardMatch, OcrMatchResult } from "@/lib/cardMatchFromScan.types";

/**
 * Match OCR-extracted card fields against the database by calling the
 * existing /api/search-cards route (server-side, no direct Supabase access
 * needed here).
 *
 * Confidence mapping:
 *   match found + OCR confidence > 0.7  →  "high"
 *   match found + OCR confidence 0.4–0.7 → "medium"
 *   no match OR OCR confidence < 0.4    →  "low"
 */
export async function matchOcrResult(ocr: OcrCardResult): Promise<OcrMatchResult> {
  if (!ocr.name) return { bestMatch: null, confidence: "low" };

  const query = ocr.cardNumber
    ? `${ocr.name} ${ocr.cardNumber}`.trim()
    : ocr.setText
    ? `${ocr.name} ${ocr.setText}`.trim()
    : ocr.name;

  try {
    const res = await fetch("/api/search-cards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) return { bestMatch: null, confidence: "low" };

    const json = await res.json();
    const cards: Array<{
      name: string;
      setName: string;
      cardNumber: string;
      imageUrl: string | null;
      market: number | null;
      cardId?: string;
    }> = json.cards ?? [];

    if (!cards.length) return { bestMatch: null, confidence: "low" };

    const top = cards[0];
    const bestMatch: ScannedCardMatch = {
      matchedName: top.name,
      matchedSetName: top.setName ?? "",
      matchedCardNumber: top.cardNumber ?? "",
      matchedImageUrl: top.imageUrl ?? null,
      matchedMarket: top.market ?? null,
      matchedCardId: top.cardId ?? "",
    };

    const confidence: OcrMatchResult["confidence"] =
      ocr.confidence > 0.7 ? "high" : ocr.confidence >= 0.4 ? "medium" : "low";

    return { bestMatch, confidence };
  } catch {
    return { bestMatch: null, confidence: "low" };
  }
}

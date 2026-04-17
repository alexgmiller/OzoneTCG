import { NextRequest, NextResponse } from "next/server";
import { matchScannedCard } from "@/lib/cardMatchFromScan.server";


export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const image: string = body.image ?? "";

  if (!image) {
    return NextResponse.json({ error: "image is required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
  }

  // ── Step 1: Claude vision identification ─────────────────────────────────────

  let name = "";
  let set_name = "";
  let card_number = "";
  let variant = "";
  let language = "en";
  let confidence = 0;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: image,
                },
              },
              {
                type: "text",
                text: `You are identifying a Pokemon trading card from a photo. Extract the following fields precisely as printed on the card:

1. name: The card's full name including suffix (e.g. "Charizard ex", "Umbreon VMAX", "Pikachu V", "Blissey")
2. set_name: The set name (e.g. "Obsidian Flames", "Evolving Skies", "Base Set") — look for the set symbol or text near the bottom
3. card_number: The collector number exactly as printed (e.g. "4/102", "215/203", "TG01/TG30", "125")
4. variant: Any special variant like "Full Art", "Secret Rare", "Rainbow Rare", "Gold", "Alternate Art", or "" if standard
5. language: "en" for English, "ja" for Japanese, "ko" for Korean, etc.
6. confidence: Your confidence score from 0 to 100 that you identified this correctly

Respond with ONLY a JSON object (no markdown, no explanation):
{"name":"...","set_name":"...","card_number":"...","variant":"...","language":"...","confidence":85}

If you cannot read a field clearly, use an empty string (not null). If this is not a Pokemon card, return {"name":"","set_name":"","card_number":"","variant":"","language":"en","confidence":0}.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[scan-card-image] Claude API error:", err);
      return NextResponse.json({ error: "Card identification failed" }, { status: 502 });
    }

    const data = await response.json();
    const text: string = data.content?.[0]?.text ?? "";

    // Parse JSON — try direct parse first, then regex fallback
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(text.trim());
    } catch {
      const match = text.match(/\{[\s\S]*?\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { /* silent */ }
      }
    }

    name = String(parsed.name ?? "").trim();
    set_name = String(parsed.set_name ?? "").trim();
    card_number = String(parsed.card_number ?? "").trim();
    variant = String(parsed.variant ?? "").trim();
    language = String(parsed.language ?? "en").trim() || "en";
    confidence = Math.min(100, Math.max(0, Number(parsed.confidence) || 0));
  } catch (err) {
    console.error("[scan-card-image] Error calling Claude:", err);
    return NextResponse.json({ error: "Card identification failed" }, { status: 500 });
  }

  if (!name) {
    return NextResponse.json({ error: "Could not identify a card in this image" }, { status: 422 });
  }

  // ── Step 2: DB matching ───────────────────────────────────────────────────────

  const lang = language === "ja" ? "ja" : "en";
  const match = await matchScannedCard({ name, set_name, card_number, language: lang });

  return NextResponse.json({
    // Vision results
    name,
    set_name,
    card_number,
    variant,
    language,
    confidence,
    // DB match (may be undefined if no match found)
    ...(match ?? {}),
  });
}

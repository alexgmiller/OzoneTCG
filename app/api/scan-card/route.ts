import { NextRequest, NextResponse } from "next/server";
import { lookupCard } from "@/lib/pokemonPriceTracker";

export async function POST(req: NextRequest) {
  const { imageBase64, mimeType } = await req.json();

  if (!imageBase64 || !mimeType) {
    return NextResponse.json({ error: "Missing imageBase64 or mimeType" }, { status: 400 });
  }

  // Normalize to a Claude-supported MIME type
  const ACCEPTED = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const normalizedMime = ACCEPTED.includes(mimeType) ? mimeType : "image/jpeg";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
  }

  // Step 1: Use Claude Vision to identify the card
  let name = "";
  let setName = "";
  let cardNumber = "";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: normalizedMime,
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text: `You are identifying a Pokemon trading card. Extract exactly these three fields from the card image:
1. name: The card's name (e.g. "Charizard", "Pikachu V", "Umbreon VMAX")
2. setName: The set name printed on the card (e.g. "Base Set", "Evolving Skies", "Paldea Evolved")
3. cardNumber: The collector number (e.g. "4/102", "215/203", "TG01/TG30")

Respond with ONLY a JSON object like: {"name":"...","setName":"...","cardNumber":"..."}
If you cannot determine a value, use an empty string.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[ScanCard] Claude API error:", err);
      return NextResponse.json({ error: "Card identification failed" }, { status: 502 });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? "";

    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      name = parsed.name ?? "";
      setName = parsed.setName ?? "";
      cardNumber = parsed.cardNumber ?? "";
    }
  } catch (err) {
    console.error("[ScanCard] Error calling Claude:", err);
    return NextResponse.json({ error: "Card identification failed" }, { status: 500 });
  }

  if (!name) {
    return NextResponse.json({ error: "Could not identify card name from image" }, { status: 422 });
  }

  // Step 2: Look up price + image using existing utility
  const lookup = await lookupCard(name, "single", { setName, cardNumber });

  return NextResponse.json({
    name,
    setName,
    cardNumber,
    imageUrl: lookup?.imageUrl ?? null,
    market: lookup?.market ?? null,
  });
}

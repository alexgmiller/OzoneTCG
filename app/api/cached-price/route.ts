import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Look up a cached market price for a card without triggering a fresh API fetch.
 *
 * Body:
 *   category: "single" | "slab" | "sealed"
 *
 *   For single/sealed:
 *     name, setName?, cardNumber?, condition? (defaults "Near Mint")
 *
 *   For slab:
 *     name, setName?, cardNumber?, gradeCompany, gradeValue
 *
 * Returns: { price: number | null }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { category, name, setName, cardNumber, condition, gradeCompany, gradeValue } = body;

  if (!name?.trim() || !category) {
    return NextResponse.json({ price: null });
  }

  try {
    const supabase = await createClient();

    if (category === "slab" && gradeCompany && gradeValue) {
      // Build lookup key matching ebay-client.ts makeSlabPriceKey
      const num = (cardNumber ?? "").split("/")[0].trim().toLowerCase();
      const key = [
        name.toLowerCase().trim(),
        (setName ?? "").toLowerCase().trim(),
        num,
        (gradeCompany as string).toUpperCase(),
        gradeValue,
      ].join("|");

      const { data } = await supabase
        .from("slab_prices")
        .select("median_price")
        .eq("lookup_key", key)
        .maybeSingle();

      return NextResponse.json({ price: data?.median_price ?? null });
    }

    // single or sealed — use raw_card_prices
    const key = [name, setName ?? "", cardNumber ?? ""]
      .map((s) => s.toLowerCase().trim())
      .join("|");

    const { data } = await supabase
      .from("raw_card_prices")
      .select("nm_price, lp_price, mp_price, hp_price, dmg_price")
      .eq("lookup_key", key)
      .maybeSingle();

    if (!data) return NextResponse.json({ price: null });

    // Map condition to the right column
    const cond = (condition ?? "Near Mint").toLowerCase();
    let price: number | null = null;
    if (cond.includes("lightly") || cond === "lp") {
      price = data.lp_price ?? data.nm_price;
    } else if (cond.includes("moderately") || cond === "mp") {
      price = data.mp_price ?? data.lp_price ?? data.nm_price;
    } else if (cond.includes("heavily") || cond === "hp") {
      price = data.hp_price ?? data.mp_price ?? data.nm_price;
    } else if (cond.includes("damaged") || cond === "dmg") {
      price = data.dmg_price ?? data.hp_price ?? data.nm_price;
    } else {
      price = data.nm_price;
    }

    return NextResponse.json({ price: price ?? null });
  } catch (e) {
    console.error("[cached-price]", e);
    return NextResponse.json({ price: null });
  }
}

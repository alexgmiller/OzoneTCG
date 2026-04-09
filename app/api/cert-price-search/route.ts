/**
 * Price search for when cert lookup failed but user entered card details manually.
 * Calls eBay Browse API and returns pricing data.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchSlabSalesFromCert, calculateSlabPricing } from "@/lib/ebay";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      name: string;
      company: string;
      grade: string;
      setName?: string | null;
      cardNumber?: string | null;
      isJapanese?: boolean;
      year?: string | null;
    };

    if (!body.name?.trim() || !body.grade?.trim()) {
      return NextResponse.json({ error: "name and grade required" }, { status: 400 });
    }

    const sales = await fetchSlabSalesFromCert({
      name: body.name.trim(),
      company: body.company ?? "PSA",
      grade: body.grade.trim(),
      setName: body.setName ?? null,
      cardNumber: body.cardNumber ?? null,
      isJapanese: body.isJapanese ?? false,
      year: body.year ?? null,
    });

    const pricing = calculateSlabPricing(sales);

    return NextResponse.json({
      market: pricing.median,
      avg: pricing.avg,
      low: pricing.low,
      high: pricing.high,
      compCount: pricing.compCount,
      lowConfidence: pricing.lowConfidence,
    });
  } catch (err) {
    console.error("[cert-price-search] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

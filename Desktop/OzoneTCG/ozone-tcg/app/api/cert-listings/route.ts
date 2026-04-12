import { NextRequest, NextResponse } from "next/server";
import { fetchSlabSalesFromCert, calculateSlabPricing, type SlabSale, type PricingResult } from "@/lib/ebay";
import type { GradingCompany } from "@/app/api/cert-lookup/route";

export type ListingsResponse = {
  listings: SlabSale[];
  pricing: PricingResult;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      name: string;
      company: GradingCompany;
      grade: string;
      cardNumber?: string | null;
      setName?: string | null;
      isJapanese?: boolean;
      year?: string | null;
    };

    if (!body.name || !body.grade) {
      return NextResponse.json({ error: "name and grade required" }, { status: 400 });
    }

    const sales = await fetchSlabSalesFromCert({
      name: body.name,
      company: body.company ?? "PSA",
      grade: body.grade,
      cardNumber: body.cardNumber,
      setName: body.setName,
      isJapanese: body.isJapanese,
      year: body.year,
    });

    const pricing = calculateSlabPricing(sales);
    // Sort ascending by price for lowest-first display
    const listings = [...sales].sort((a, b) => a.price - b.price);

    return NextResponse.json({ listings, pricing } satisfies ListingsResponse);
  } catch (err) {
    console.error("[cert-listings]", err);
    return NextResponse.json({ error: "Failed to fetch listings" }, { status: 500 });
  }
}

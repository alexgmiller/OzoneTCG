import { NextRequest, NextResponse } from "next/server";
import { fetchSlabSoldSales, calculateSoldPricing, type SlabSale, type SoldPricingResult } from "@/lib/ebay";
import type { GradingCompany } from "@/app/api/cert-lookup/route";

export type SoldResponse = {
  sales: SlabSale[];
  pricing: SoldPricingResult;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      name: string;
      company: GradingCompany;
      grade: string;
      cardNumber?: string | null;
    };

    if (!body.name || !body.grade) {
      return NextResponse.json({ error: "name and grade required" }, { status: 400 });
    }

    const { sales, source } = await fetchSlabSoldSales(
      body.name,
      body.company ?? "PSA",
      body.grade,
      body.cardNumber
    );

    const pricing = calculateSoldPricing(sales, source);
    // Sort newest first
    const sorted = [...sales].sort(
      (a, b) => new Date(b.soldDate).getTime() - new Date(a.soldDate).getTime()
    );

    return NextResponse.json({ sales: sorted, pricing } satisfies SoldResponse);
  } catch (err) {
    console.error("[cert-sold]", err);
    return NextResponse.json({ error: "Failed to fetch sold listings" }, { status: 500 });
  }
}

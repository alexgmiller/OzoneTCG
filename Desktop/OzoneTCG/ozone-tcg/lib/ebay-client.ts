/**
 * Client-safe eBay utilities — pure functions and types only.
 * No server-side imports, safe to use in client components.
 * Server-side API/scraper functions live in lib/ebay.ts.
 */

export type ParsedGrade = { company: string; grade: string };

export type SlabSale = {
  price: number;
  title: string;
  soldDate: string;
  isBestOffer: boolean;
  buyingOptions: string[];
  bidCount?: number;
  itemUrl: string;
};

export function parseGrade(rawGrade: string): ParsedGrade | null {
  const m = rawGrade.trim().match(/^([A-Za-z]+)\s+(.+)$/);
  if (!m) return null;
  return { company: m[1].toUpperCase(), grade: m[2].trim() };
}

export function makeSlabPriceKey(
  name: string,
  setName: string | null | undefined,
  cardNumber: string | null | undefined,
  company: string,
  grade: string
): string {
  const num = (cardNumber ?? "").split("/")[0].trim().toLowerCase();
  return [
    name.toLowerCase().trim(),
    (setName ?? "").toLowerCase().trim(),
    num,
    company.toUpperCase(),
    grade,
  ].join("|");
}

/**
 * Server-side cert lookup for PSA / BGS / CGC graded cards.
 * Returns card details + live eBay pricing in a single call.
 *
 * Supabase migrations needed (run once):
 *   ALTER TABLE items ADD COLUMN IF NOT EXISTS cert_number TEXT;
 *   ALTER TABLE items ADD COLUMN IF NOT EXISTS variety TEXT;
 *   ALTER TABLE items ADD COLUMN IF NOT EXISTS population INTEGER;
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchSlabSalesFromCert, calculateSlabPricing } from "@/lib/ebay";

export type GradingCompany = "PSA" | "BGS" | "CGC" | "TAG";

export type CertLookupResult = {
  certNumber: string;
  company: GradingCompany;
  name: string;
  setName?: string | null;
  cardNumber?: string | null;
  grade: string;              // numeric e.g. "10", "9.5"
  gradeLabel?: string | null; // e.g. "GEM MT"
  year?: string | null;
  variety?: string | null;    // e.g. "HOLO-1ST EDITION"
  population?: number | null; // PSA total pop for this grade
  populationHigher?: number | null; // PSA pop of grades above this one
  isJapanese?: boolean;
  market: number | null;
  compCount: number;
  lookupFailed: boolean;
  lookupError?: string;
};

// ── helpers ──────────────────────────────────────────────────────────────────

function toTitleCase(s: string): string {
  if (!s) return "";
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function detectCompany(certNumber: string): GradingCompany {
  if (/^[A-Za-z]/.test(certNumber.trim())) return "CGC";
  return "PSA";
}

/**
 * Extract trailing numeric grade from PSA's CardGrade field.
 * PSA typically sends just "10" but may include labels: "GEM MT 10" → "10"
 */
function normalizeGrade(raw: string): string {
  if (!raw) return raw;
  const m = raw.trim().match(/(\d+\.?\d*)$/);
  return m ? m[1] : raw.trim();
}

/**
 * Clean PSA Brand into a usable set name.
 * "POKEMON JAPANESE VS" → "VS"
 * "POKEMON SCARLET & VIOLET PRISMATIC EVOLUTIONS" → "Prismatic Evolutions"
 * "POKEMON CELEBRATIONS" → "Celebrations"
 */
function cleanPSABrand(brand: string): { setName: string; isJapanese: boolean } {
  if (!brand) return { setName: "", isJapanese: false };
  const upper = brand.toUpperCase();
  const isJapanese = upper.includes("JAPANESE");

  let cleaned = brand
    .replace(/\bPOKEMON\b/gi, "")
    .replace(/\bJAPANESE\b/gi, "")
    .replace(/\bENGLISH\b/gi, "")
    .replace(/\bKOREAN\b/gi, "")
    .replace(/\bCHINESE\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { setName: toTitleCase(cleaned), isJapanese };
}

/**
 * Clean PSA Variety into readable variant text.
 * "HOLO-1ST EDITION" → "Holo - 1st Edition"
 * "NON-HOLO-1ST EDITION" → "Non-Holo - 1st Edition"
 */
function cleanVariety(variety: string): string {
  if (!variety) return "";
  return variety
    .replace(/-/g, " - ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b1St\b/g, "1st")
    .replace(/\b2Nd\b/g, "2nd");
}

// ── PSA lookup ────────────────────────────────────────────────────────────────

type PSALookupResult = {
  name: string;
  setName?: string;
  cardNumber?: string;
  grade: string;
  gradeLabel?: string;
  year?: string;
  variety?: string;
  population?: number;
  populationHigher?: number;
  isJapanese: boolean;
};

type PSAError = { code: number; message: string };

function isPSAError(r: PSALookupResult | PSAError): r is PSAError {
  return "code" in r;
}

async function lookupPSA(certNumber: string): Promise<PSALookupResult | PSAError> {
  const apiKey = process.env.PSA_API_KEY;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (compatible)",
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  let res: Response;
  try {
    res = await fetch(
      `https://api.psacard.com/publicapi/cert/GetByCertNumber/${certNumber}`,
      { headers, signal: AbortSignal.timeout(8000), next: { revalidate: 3600 } }
    );
  } catch {
    return { code: 0, message: "PSA API unreachable (network timeout)" };
  }

  if (res.status === 429) {
    return { code: 429, message: "PSA API daily quota exceeded (100 free calls/day). Add a PSA_API_KEY to .env.local to increase the limit." };
  }
  if (res.status === 401 || res.status === 403) {
    return { code: res.status, message: "PSA API requires authentication. Set PSA_API_KEY in .env.local." };
  }
  if (!res.ok) {
    return { code: res.status, message: `PSA API returned HTTP ${res.status}` };
  }

  let data: unknown;
  try { data = await res.json(); }
  catch { return { code: -1, message: "PSA API returned non-JSON response" }; }

  // Full raw response for debugging
  console.log("[cert-lookup] Raw PSA API response:", JSON.stringify(data, null, 2));

  const cert = (data as Record<string, unknown>)?.PSACert as Record<string, unknown> | null;

  if (!cert || !cert.CertNumber || cert.CertNumber === "0") {
    return { code: 404, message: "Cert number not found in PSA database" };
  }

  const str = (k: string) => String(cert[k] ?? "");
  const num = (k: string): number | undefined => {
    const n = Number(cert[k]);
    return Number.isFinite(n) ? n : undefined;
  };

  const { setName, isJapanese } = cleanPSABrand(str("Brand"));
  const variety = cleanVariety(str("Variety"));

  const result: PSALookupResult = {
    name: toTitleCase(str("Subject")),
    setName: setName || toTitleCase(str("Series")) || undefined,
    cardNumber: str("CardNumber") || undefined,
    grade: normalizeGrade(str("CardGrade")),
    gradeLabel: str("GradeDescription") || undefined,
    year: str("Year") || undefined,
    variety: variety || undefined,
    population: num("TotalPopulation"),
    populationHigher: num("PopulationHigher"),
    isJapanese,
  };

  console.log("[cert-lookup] Parsed cert fields:", JSON.stringify(result, null, 2));

  // Log any fields we didn't map
  const knownKeys = ["CertNumber", "Subject", "Brand", "Series", "CardNumber",
    "CardGrade", "GradeDescription", "Year", "Variety", "TotalPopulation",
    "PopulationHigher", "LabelType"];
  const unused = Object.fromEntries(
    Object.entries(cert).filter(([k]) => !knownKeys.includes(k) && cert[k] !== "" && cert[k] !== null)
  );
  if (Object.keys(unused).length > 0) {
    console.log("[cert-lookup] Unmapped PSA fields:", JSON.stringify(unused, null, 2));
  }

  return result;
}

// ── BGS / CGC / TAG: no public API ────────────────────────────────────────────

async function lookupBGS(_: string): Promise<null> { return null; }
async function lookupCGC(_: string): Promise<null> { return null; }
async function lookupTAG(_: string): Promise<null> { return null; }

// ── route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { certNumber?: string; company?: GradingCompany };

    const raw = body.certNumber?.trim() ?? "";
    if (!raw) return NextResponse.json({ error: "certNumber required" }, { status: 400 });

    const certNumber = /^[A-Za-z]/.test(raw) ? raw : raw.replace(/\D/g, "");
    const company: GradingCompany = body.company ?? detectCompany(raw);

    // ── Cert lookup ───────────────────────────────────────────────────────────

    let certDetails: PSALookupResult | null = null;
    let lookupErrorMsg: string | undefined;

    if (company === "PSA") {
      const result = await lookupPSA(certNumber);
      if (isPSAError(result)) {
        lookupErrorMsg = result.message;
      } else {
        certDetails = result;
      }
    } else if (company === "BGS") {
      await lookupBGS(certNumber);
      lookupErrorMsg = "BGS cert lookup not supported yet — enter card details manually.";
    } else if (company === "CGC") {
      await lookupCGC(certNumber);
      lookupErrorMsg = "CGC cert lookup not supported yet — enter card details manually.";
    } else if (company === "TAG") {
      await lookupTAG(certNumber);
      lookupErrorMsg = "TAG does not have a public cert API — enter card details manually.";
    }

    if (!certDetails) {
      return NextResponse.json({
        certNumber, company, name: "", grade: "",
        market: null, compCount: 0, lookupFailed: true,
        lookupError: lookupErrorMsg ?? "Cert lookup failed",
      } satisfies CertLookupResult);
    }

    // ── eBay pricing ──────────────────────────────────────────────────────────

    console.log("[cert-lookup] eBay query params:", {
      name: certDetails.name,
      company,
      grade: certDetails.grade,
      setName: certDetails.setName,
      cardNumber: certDetails.cardNumber,
      isJapanese: certDetails.isJapanese,
      year: certDetails.year,
    });

    let market: number | null = null;
    let compCount = 0;

    try {
      const sales = await fetchSlabSalesFromCert({
        name: certDetails.name,
        company,
        grade: certDetails.grade,
        setName: certDetails.setName,
        cardNumber: certDetails.cardNumber,
        isJapanese: certDetails.isJapanese,
        year: certDetails.year,
      });
      const pricing = calculateSlabPricing(sales);
      market = pricing.median;
      compCount = pricing.compCount;
      console.log("[cert-lookup] eBay pricing result:", { market, compCount });
    } catch (e) {
      console.error("[cert-lookup] eBay pricing failed (non-fatal):", e);
    }

    const response: CertLookupResult = {
      certNumber,
      company,
      name: certDetails.name,
      setName: certDetails.setName ?? null,
      cardNumber: certDetails.cardNumber ?? null,
      grade: certDetails.grade,
      gradeLabel: certDetails.gradeLabel ?? null,
      year: certDetails.year ?? null,
      variety: certDetails.variety ?? null,
      population: certDetails.population ?? null,
      populationHigher: certDetails.populationHigher ?? null,
      isJapanese: certDetails.isJapanese,
      market,
      compCount,
      lookupFailed: false,
    };

    console.log("[cert-lookup] Sending to client:", JSON.stringify(response, null, 2));

    return NextResponse.json(response satisfies CertLookupResult);
  } catch (err) {
    console.error("[cert-lookup] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

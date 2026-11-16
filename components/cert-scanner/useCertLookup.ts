"use client";

import { useRef, useState } from "react";
import type { CertLookupResult, GradingCompany } from "@/app/api/cert-lookup/route";
import type { SlabSale, PricingResult, SoldPricingResult } from "@/lib/ebay";
import { computeBlendedFMV, type FMVResult, type PricingStrategyOverride } from "@/lib/fmv";
import {
  cacheKey, getAdjacentGrades,
  type ActiveListingsState, type GradeData, type ScanPhase, type SoldState,
} from "./shared";

// ── Types ──

export type FallbackFields = {
  name: string;
  grade: string;
  setName: string;
  cardNumber: string;
  market: string;
};

type CardMeta = Pick<CertLookupResult, "name" | "cardNumber" | "setName" | "isJapanese" | "year">;

export type CertLookup = ReturnType<typeof useCertLookup>;

// ── Price selection ──
// "auto" = blended FMV (sold + listed). q1 / median / q3 pick that percentile
// of the active-listing pricing for the selected grade, falling back to FMV.

function pickMarket(
  strategy: PricingStrategyOverride,
  fmv: FMVResult,
  g: GradeData | undefined,
): { market: number | null; label: string } {
  if (strategy === "q1" && g?.q1 != null) return { market: g.q1, label: "Q1 listed" };
  if (strategy === "median" && g?.market != null) return { market: g.market, label: "Median" };
  if (strategy === "q3" && g?.q3 != null) return { market: g.q3, label: "Q3 listed" };
  const label = fmv.mode === "blended" ? "Blended"
    : fmv.mode === "sold_only" ? "Sold"
    : fmv.mode === "active_only" ? "Listed"
    : "Market";
  return { market: fmv.fmv ?? g?.market ?? null, label };
}

function emptyGrade(r: Pick<CertLookupResult, "market" | "q1" | "q3" | "compCount">): GradeData {
  return {
    market: r.market,
    q1: r.q1 ?? null,
    q3: r.q3 ?? null,
    compCount: r.compCount,
    listings: { items: [], lowest: null, loading: true },
    sold: { items: [], pricing: null, loading: true, showAll: false },
  };
}

// ── Hook ──

export function useCertLookup({
  company,
  pricingStrategy,
  onScanned,
  onError,
}: {
  company: GradingCompany;
  pricingStrategy: PricingStrategyOverride;
  onScanned: (r: CertLookupResult) => void;
  onError: (msg: string) => void;
}) {
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [manualCert, setManualCert] = useState("");
  const [result, setResult] = useState<CertLookupResult | null>(null);
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedViewCompany, setSelectedViewCompany] = useState<GradingCompany>("PSA");
  const [gradeCache, setGradeCache] = useState<Record<string, GradeData>>({});
  const fetchingGrades = useRef(new Set<string>());
  const fetchedGrades = useRef(new Set<string>());

  // ── Per-grade/company data fetching ──

  function fetchGradeData(grade: string, viewCompany: GradingCompany, data: CardMeta) {
    const key = cacheKey(viewCompany, grade);
    if (fetchingGrades.current.has(key) || fetchedGrades.current.has(key)) return;
    fetchingGrades.current.add(key);

    setGradeCache((prev) => ({
      ...prev,
      [key]: {
        market: prev[key]?.market ?? null,
        q1: prev[key]?.q1 ?? null,
        q3: prev[key]?.q3 ?? null,
        compCount: prev[key]?.compCount ?? 0,
        listings: { items: [], lowest: null, loading: true },
        sold: { items: [], pricing: null, loading: true, showAll: false },
      },
    }));

    let listingsDone = false;
    let soldDone = false;
    function checkDone() {
      if (listingsDone && soldDone) {
        fetchingGrades.current.delete(key);
        fetchedGrades.current.add(key);
      }
    }

    fetch("/api/cert-listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name, company: viewCompany, grade,
        cardNumber: data.cardNumber, setName: data.setName,
        isJapanese: data.isJapanese, year: data.year,
      }),
    })
      .then((r) => r.json())
      .then(({ listings, pricing }: { listings: SlabSale[]; pricing: PricingResult }) => {
        const sorted = [...listings].sort((a, b) => a.price - b.price);
        setGradeCache((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            market: pricing.median ?? prev[key]?.market ?? null,
            q1: pricing.q1 ?? prev[key]?.q1 ?? null,
            q3: pricing.q3 ?? prev[key]?.q3 ?? null,
            compCount: pricing.compCount,
            listings: { items: sorted, lowest: sorted[0]?.price ?? null, loading: false },
          },
        }));
      })
      .catch(() => {
        setGradeCache((prev) => ({
          ...prev,
          [key]: { ...prev[key], listings: { items: [], lowest: null, loading: false } },
        }));
      })
      .finally(() => { listingsDone = true; checkDone(); });

    fetch("/api/cert-sold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: data.name, company: viewCompany, grade, cardNumber: data.cardNumber }),
    })
      .then((r) => r.json())
      .then(({ sales, pricing }: { sales: SlabSale[]; pricing: SoldPricingResult }) => {
        setGradeCache((prev) => ({
          ...prev,
          [key]: { ...prev[key], sold: { items: sales, pricing, loading: false, showAll: false } },
        }));
      })
      .catch(() => {
        setGradeCache((prev) => ({
          ...prev,
          [key]: { ...prev[key], sold: { items: [], pricing: null, loading: false, showAll: false } },
        }));
      })
      .finally(() => { soldDone = true; checkDone(); });
  }

  // Seed the cache with the scanned grade, then fetch it in the background.
  function seedCache(r: CertLookupResult) {
    setSelectedGrade(r.grade);
    setSelectedViewCompany(r.company);
    fetchingGrades.current.clear();
    fetchedGrades.current.clear();
    setGradeCache({ [cacheKey(r.company, r.grade)]: emptyGrade(r) });
    fetchGradeData(r.grade, r.company, r);
  }

  function selectGrade(grade: string) {
    setSelectedGrade(grade);
    if (result) fetchGradeData(grade, selectedViewCompany, result);
  }

  function selectViewCompany(co: GradingCompany) {
    setSelectedViewCompany(co);
    if (result) fetchGradeData(selectedGrade, co, result);
  }

  function isGradeFetching(grade: string): boolean {
    const k = cacheKey(selectedViewCompany, grade);
    return fetchingGrades.current.has(k) || (gradeCache[k]?.listings.loading ?? false);
  }

  // ── Cert lookup ──

  // `co` overrides the picker (used when re-running a history entry).
  async function lookupCert(certNumber: string, co: GradingCompany = company) {
    setManualCert(certNumber);
    setPhase("lookup");
    setResult(null);
    setSelectedGrade("");
    setGradeCache({});

    try {
      const res = await fetch("/api/cert-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certNumber, company: co }),
      });
      const data: CertLookupResult = await res.json();

      if (data.lookupFailed) {
        setResult(data);
        setPhase("manual_details");
        return;
      }

      setResult(data);
      setPhase("result");
      onScanned(data);
      seedCache(data);
      getAdjacentGrades(data.grade)
        .filter((g) => g !== data.grade)
        .forEach((g) => fetchGradeData(g, data.company, data));
    } catch {
      onError("Network error — check your connection");
      setPhase("idle");
    }
  }

  function submitManualCert() {
    const cert = manualCert.trim().replace(/\D/g, "");
    if (!cert || cert.length < 5) return;
    lookupCert(cert);
  }

  // ── Manual fallback price lookup (cert lookup failed) ──

  async function lookupFallback(f: FallbackFields) {
    const name = f.name.trim();
    const grade = f.grade.trim();
    if (!name || !grade) return;
    setPhase("lookup");

    const override = f.market ? parseFloat(f.market) || null : null;
    const base: CertLookupResult = {
      certNumber: result?.certNumber ?? "",
      company,
      name,
      setName: f.setName.trim() || null,
      cardNumber: f.cardNumber.trim() || null,
      grade,
      market: override,
      q1: null,
      q3: null,
      compCount: 0,
      lookupFailed: false,
    };

    let r = base;
    try {
      const res = await fetch("/api/cert-price-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, company, grade, setName: base.setName, cardNumber: base.cardNumber }),
      });
      const data = await res.json();
      r = { ...base, market: override ?? data.market ?? null, compCount: data.compCount ?? 0 };
    } catch {
      // Fall through with manual values only.
    }
    setResult(r);
    seedCache(r);
    setPhase("result");
  }

  // ── Reset ──

  function reset() {
    setPhase("idle");
    setResult(null);
    setManualCert("");
    setSelectedGrade("");
    setSelectedViewCompany("PSA");
    setGradeCache({});
    fetchingGrades.current.clear();
    fetchedGrades.current.clear();
  }

  // ── Derived display values ──

  const displayKey = cacheKey(selectedViewCompany, selectedGrade);
  const displayGrade = gradeCache[displayKey];
  const fmv = computeBlendedFMV(displayGrade?.sold.items ?? [], displayGrade?.listings.items ?? []);
  const picked = pickMarket(pricingStrategy, fmv, displayGrade);
  const listings: ActiveListingsState =
    displayGrade?.listings ?? { items: [], lowest: null, loading: !!selectedGrade };
  const sold: SoldState =
    displayGrade?.sold ?? { items: [], pricing: null, loading: !!selectedGrade, showAll: false };

  const display = {
    market: picked.market,
    marketLabel: picked.label,
    marketLoading: (displayGrade?.listings.loading ?? false) && picked.market == null,
    compCount: displayGrade?.compCount ?? 0,
    listings,
    sold,
  };

  function toggleSoldShowAll() {
    setGradeCache((prev) => {
      const g = prev[displayKey];
      if (!g) return prev;
      return { ...prev, [displayKey]: { ...g, sold: { ...g.sold, showAll: !g.sold.showAll } } };
    });
  }

  return {
    phase, result, manualCert, setManualCert,
    selectedGrade, selectedViewCompany, display,
    lookupCert, submitManualCert, lookupFallback, reset,
    selectGrade, selectViewCompany, isGradeFetching, toggleSoldShowAll,
  };
}

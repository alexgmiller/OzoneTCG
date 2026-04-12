"use client";

import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import {
  X, ScanLine, RefreshCw,
  Package, ShoppingCart, Trash2,
  ChevronDown, ChevronUp, History,
  CheckCircle, AlertCircle, Loader2,
  ExternalLink,
} from "lucide-react";
import { createItem } from "@/app/protected/inventory/actions";
import { recordCertBuy, type CertBuyItem } from "@/app/protected/transactions/actions";
import type { CertLookupResult, GradingCompany } from "@/app/api/cert-lookup/route";
import type { SlabSale, PricingResult, SoldPricingResult } from "@/lib/ebay";

// ── Constants ─────────────────────────────────────────────────────────────────

const OFFER_PRESETS = [70, 75, 80, 85, 90];
const HISTORY_KEY = "ozone_cert_scan_history";
const MAX_HISTORY = 50;

// Standard grade ladder (ascending). Used for adjacent-grade lookup.
const GRADE_LADDER = [
  "1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5",
  "5", "5.5", "6", "7", "7.5", "8", "8.5", "9", "9.5", "10",
];

function getAdjacentGrades(grade: string): string[] {
  const idx = GRADE_LADDER.indexOf(grade);
  if (idx === -1) return [grade];
  const above = GRADE_LADDER[idx + 1] ?? null;
  const below = GRADE_LADDER[idx - 1] ?? null;
  return [above, grade, below].filter(Boolean) as string[];
}

/** Cache key for a company + grade combo: "PSA|10", "BGS|9.5", etc. */
function cacheKey(company: GradingCompany, grade: string): string {
  return `${company}|${grade}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ScanPhase = "idle" | "lookup" | "result" | "manual_details";

interface BatchItem extends CertLookupResult {
  id: string;
  offerPct: number;
  addedAt: string;
}

interface HistoryEntry {
  id: string;
  certNumber: string;
  company: GradingCompany;
  grade: string;
  name: string;
  market: number | null;
  offerPct: number;
  scannedAt: string;
}

type ActiveListingsState = { items: SlabSale[]; lowest: number | null; loading: boolean };
type SoldState = { items: SlabSale[]; pricing: SoldPricingResult | null; loading: boolean; showAll: boolean };
type GradeData = { market: number | null; compCount: number; listings: ActiveListingsState; sold: SoldState };

// ── Helpers ───────────────────────────────────────────────────────────────────

function money(n: number | null | undefined): string {
  if (n == null || n === 0) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function offerAmount(market: number | null, pct: number): string {
  if (!market) return "—";
  return money((market * pct) / 100);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CompanyToggle({
  value,
  onChange,
}: {
  value: GradingCompany;
  onChange: (c: GradingCompany) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {(["PSA", "BGS", "CGC", "TAG"] as GradingCompany[]).map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`text-xs font-semibold px-3 py-1 rounded-full transition-all ${
            value === c
              ? "text-white"
              : "border border-border text-muted-foreground hover:text-foreground"
          }`}
          style={value === c ? { background: "var(--accent-primary)" } : {}}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

function ListingTypeBadge({ types }: { types: string[] }) {
  if (types.includes("AUCTION")) {
    return (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 shrink-0">
        Auction
      </span>
    );
  }
  if (types.includes("BEST_OFFER")) {
    return (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 shrink-0">
        Best Offer
      </span>
    );
  }
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-500 shrink-0">
      Fixed
    </span>
  );
}

function OfferCalc({
  market,
  selectedPct,
  onSelectPct,
}: {
  market: number | null;
  selectedPct: number;
  onSelectPct: (pct: number) => void;
}) {
  const [customVal, setCustomVal] = useState("");

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-widest opacity-50 mb-2">
        Offer Calculator
      </div>
      <div className="flex gap-1.5">
        {OFFER_PRESETS.map((pct) => (
          <button
            key={pct}
            onClick={() => onSelectPct(pct)}
            className={`flex-1 py-1.5 rounded-lg border text-center transition-all ${
              selectedPct === pct
                ? "border-violet-500 bg-violet-500/15 dark:bg-violet-500/20"
                : "border-border hover:border-violet-400 bg-background"
            }`}
          >
            <div className="text-[10px] opacity-60 leading-tight">{pct}%</div>
            <div
              className="text-xs font-bold leading-tight"
              style={{ fontFamily: "var(--font-space-mono, monospace)" }}
            >
              {offerAmount(market, pct)}
            </div>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <div className="text-xs opacity-50">Custom:</div>
        <input
          type="number"
          min={1}
          max={200}
          value={customVal}
          onChange={(e) => setCustomVal(e.target.value)}
          onBlur={() => {
            const n = parseFloat(customVal);
            if (n > 0 && n <= 200) onSelectPct(n);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const n = parseFloat(customVal);
              if (n > 0 && n <= 200) onSelectPct(n);
            }
          }}
          placeholder="e.g. 72"
          className="w-20 bg-background border rounded-lg px-2 py-1 text-sm text-center"
        />
        {customVal && !OFFER_PRESETS.includes(parseFloat(customVal)) && (
          <div className="text-sm font-bold" style={{ fontFamily: "var(--font-space-mono, monospace)" }}>
            = {offerAmount(market, parseFloat(customVal) || 0)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CertScanner() {
  // ── phase / company
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [company, setCompany] = useState<GradingCompany>("PSA");

  // ── manual input
  const [manualCert, setManualCert] = useState("");
  const manualInputRef = useRef<HTMLInputElement>(null);

  // ── result auto-scroll
  const resultRef = useRef<HTMLDivElement>(null);

  // ── camera (html5-qrcode)
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const scannerStartedRef = useRef(false); // true only after scanner.start() resolves
  const detectedRef = useRef(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // ── result state
  const [result, setResult] = useState<CertLookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // ── grade tabs + per-grade/company cache
  const [selectedGrade, setSelectedGrade] = useState<string>("");
  const [selectedViewCompany, setSelectedViewCompany] = useState<GradingCompany>("PSA");
  const [gradeCache, setGradeCache] = useState<Record<string, GradeData>>({});
  const gradeScrollRef = useRef<HTMLDivElement>(null);
  const fetchingGrades = useRef(new Set<string>());
  const fetchedGrades = useRef(new Set<string>());

  // ── manual fallback details (when cert lookup fails)
  const [fallbackName, setFallbackName] = useState("");
  const [fallbackGrade, setFallbackGrade] = useState("");
  const [fallbackSet, setFallbackSet] = useState("");
  const [fallbackCardNum, setFallbackCardNum] = useState("");
  const [fallbackMarket, setFallbackMarket] = useState("");

  // ── offer calculator
  const [selectedPct, setSelectedPct] = useState(70);

  // ── batch scan
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);

  // ── scan history
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // ── feedback
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // ── buy modal
  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [buyPaymentType, setBuyPaymentType] = useState("cash");
  const [buyOwner, setBuyOwner] = useState<"alex" | "mila" | "shared">("shared");
  const [bulkBuyMode, setBulkBuyMode] = useState(false);

  // ── Load history ──────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) setHistory(JSON.parse(stored));
    } catch {}
  }, []);

  // Auto-scroll to result when scan completes
  useEffect(() => {
    if (phase === "result") {
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
  }, [phase]);

  // Auto-scroll selected grade pill into view
  useEffect(() => {
    if (!gradeScrollRef.current || !selectedGrade) return;
    const el = gradeScrollRef.current.querySelector(`[data-grade="${selectedGrade}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [selectedGrade]);

  function saveToHistory(entry: HistoryEntry) {
    setHistory((prev) => {
      const updated = [entry, ...prev.filter((h) => h.id !== entry.id)].slice(0, MAX_HISTORY);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }

  // ── Camera scanning (html5-qrcode) ───────────────────────────────────────

  useEffect(() => {
    if (phase !== "idle") {
      // Only stop if scanner actually started successfully
      if (scannerRef.current && scannerStartedRef.current) {
        scannerStartedRef.current = false;
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
      setCameraReady(false);
      return;
    }

    detectedRef.current = false;
    setCameraError(null);
    setCameraReady(false);
    let mounted = true;

    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (!mounted) return;

        const scanner = new Html5Qrcode("cert-scanner-container", {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.CODABAR,
          ],
        });
        // Store ref before start so cleanup can reach the instance,
        // but scannerStartedRef stays false until start() resolves.
        scannerRef.current = { stop: () => scanner.stop() };

        await scanner.start(
          { facingMode: "environment" },
          { fps: 15 },
          (decodedText) => {
            if (!mounted || detectedRef.current) return;
            const cleaned = decodedText.replace(/\D/g, "");
            if (cleaned.length >= 7 && cleaned.length <= 12) {
              detectedRef.current = true;
              try { navigator.vibrate?.(50); } catch {}
              // Guard stop: only stop if we know it's running
              if (scannerStartedRef.current) {
                scannerStartedRef.current = false;
                scanner.stop().catch(() => {});
              }
              scannerRef.current = null;
              handleCertDetected(cleaned);
            }
          },
          () => { /* per-frame no-barcode error — ignore */ }
        );

        if (!mounted) {
          // Cleanup ran while start() was in-flight — stop now that it's running
          try { await scanner.stop(); } catch {}
          return;
        }

        // start() resolved with component still mounted — scanner is now running
        scannerStartedRef.current = true;
        setCameraReady(true);
        try {
          const settings = scanner.getRunningTrackSettings();
          console.log("[CertScanner] Camera settings:", JSON.stringify(settings));
        } catch {}
      } catch (err) {
        if (mounted) {
          console.warn("[CertScanner] Camera start error:", err);
          setCameraError(
            err instanceof Error && (err.message.includes("Permission") || err.message.includes("NotAllowed"))
              ? "Camera access denied"
              : "Camera unavailable"
          );
        }
      }
    })();

    return () => {
      mounted = false;
      // Only stop if start() already resolved — otherwise the in-flight
      // start() completion handler above will stop it once it resolves
      if (scannerRef.current && scannerStartedRef.current) {
        scannerStartedRef.current = false;
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Per-grade/company data fetching ─────────────────────────────────────────

  function fetchGradeData(
    grade: string,
    viewCompany: GradingCompany,
    data: Pick<CertLookupResult, "name" | "cardNumber" | "setName" | "isJapanese" | "year">
  ) {
    const key = cacheKey(viewCompany, grade);
    if (fetchingGrades.current.has(key) || fetchedGrades.current.has(key)) return;
    fetchingGrades.current.add(key);

    setGradeCache((prev) => ({
      ...prev,
      [key]: {
        market: prev[key]?.market ?? null,
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
          [key]: {
            ...prev[key],
            sold: { items: sales, pricing, loading: false, showAll: false },
          },
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

  function handleGradeSelect(grade: string) {
    setSelectedGrade(grade);
    if (!result) return;
    const key = cacheKey(selectedViewCompany, grade);
    if (fetchedGrades.current.has(key) || fetchingGrades.current.has(key)) return;
    fetchGradeData(grade, selectedViewCompany, result);
  }

  function handleCompanySelect(co: GradingCompany) {
    setSelectedViewCompany(co);
    if (!result) return;
    const key = cacheKey(co, selectedGrade);
    if (fetchedGrades.current.has(key) || fetchingGrades.current.has(key)) return;
    fetchGradeData(selectedGrade, co, result);
  }

  // ── Cert lookup + background data fetches ────────────────────────────────

  const handleCertDetected = useCallback(
    async (certNumber: string) => {
      setManualCert(certNumber);
      setPhase("lookup");
      setResult(null);
      setLookupError(null);
      setSelectedGrade("");
      setGradeCache({});

      try {
        const res = await fetch("/api/cert-lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ certNumber, company }),
        });
        const data: CertLookupResult = await res.json();

        if (data.lookupFailed) {
          setResult(data);
          setFallbackName("");
          setFallbackGrade("");
          setFallbackSet("");
          setFallbackCardNum("");
          setFallbackMarket("");
          setPhase("manual_details");
          return;
        }

        setResult(data);
        setPhase("result");
        saveToHistory({
          id: crypto.randomUUID(),
          certNumber: data.certNumber,
          company: data.company,
          grade: data.grade,
          name: data.name,
          market: data.market,
          offerPct: selectedPct,
          scannedAt: new Date().toISOString(),
        });

        // ── Seed cache with scanned grade market from cert lookup ──────────
        setSelectedGrade(data.grade);
        setSelectedViewCompany(data.company);
        setGradeCache({
          [cacheKey(data.company, data.grade)]: {
            market: data.market,
            compCount: data.compCount,
            listings: { items: [], lowest: null, loading: true },
            sold: { items: [], pricing: null, loading: true, showAll: false },
          },
        });
        fetchingGrades.current.clear();
        fetchedGrades.current.clear();

        // ── Background: fetch scanned grade + adjacent grades ─────────────
        fetchGradeData(data.grade, data.company, data);
        getAdjacentGrades(data.grade)
          .filter((g) => g !== data.grade)
          .forEach((g) => fetchGradeData(g, data.company, data));
      } catch {
        setLookupError("Network error — check your connection");
        setPhase("idle");
      }
    },
    [company, selectedPct]
  );

  // ── Manual cert submit ────────────────────────────────────────────────────

  function handleManualSubmit() {
    const cert = manualCert.trim().replace(/\D/g, "");
    if (!cert || cert.length < 5) return;
    handleCertDetected(cert);
  }

  // ── Manual fallback price lookup ──────────────────────────────────────────

  async function handleFallbackLookup() {
    if (!fallbackName.trim() || !fallbackGrade.trim()) return;
    setPhase("lookup");
    const grade = fallbackGrade.trim();

    function initFallbackResult(market: number | null, compCount: number): CertLookupResult {
      return {
        certNumber: result?.certNumber ?? "",
        company,
        name: fallbackName.trim(),
        setName: fallbackSet.trim() || null,
        cardNumber: fallbackCardNum.trim() || null,
        grade,
        market,
        compCount,
        lookupFailed: false,
      };
    }

    function seedCache(r: CertLookupResult) {
      setSelectedGrade(r.grade);
      setSelectedViewCompany(r.company);
      fetchingGrades.current.clear();
      fetchedGrades.current.clear();
      setGradeCache({
        [cacheKey(r.company, r.grade)]: {
          market: r.market,
          compCount: r.compCount,
          listings: { items: [], lowest: null, loading: true },
          sold: { items: [], pricing: null, loading: true, showAll: false },
        },
      });
      fetchGradeData(r.grade, r.company, r);
    }

    try {
      const res = await fetch("/api/cert-price-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fallbackName.trim(), company, grade,
          setName: fallbackSet.trim() || null, cardNumber: fallbackCardNum.trim() || null,
        }),
      });
      const data = await res.json();
      const r = initFallbackResult(
        fallbackMarket ? parseFloat(fallbackMarket) || (data.market ?? null) : (data.market ?? null),
        data.compCount ?? 0
      );
      setResult(r);
      seedCache(r);
      setPhase("result");
    } catch {
      const r = initFallbackResult(fallbackMarket ? parseFloat(fallbackMarket) : null, 0);
      setResult(r);
      seedCache(r);
      setPhase("result");
    }
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  function resetForNext() {
    setPhase("idle");
    setResult(null);
    setLookupError(null);
    setManualCert("");
    setFallbackName("");
    setFallbackGrade("");
    setFallbackMarket("");
    setSelectedGrade("");
    setSelectedViewCompany("PSA");
    setGradeCache({});
    fetchingGrades.current.clear();
    fetchedGrades.current.clear();
    detectedRef.current = false;
  }

  // ── Toast helper ──────────────────────────────────────────────────────────

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Add to inventory ──────────────────────────────────────────────────────

  async function handleAddToInventory(card?: BatchItem) {
    const data = card ?? (result ? buildBatchItem(result, result.certNumber) : null);
    if (!data) return;
    setActionLoading(true);
    try {
      await createItem({
        category: "slab",
        owner: "shared",
        status: "inventory",
        name: data.name,
        condition: "Near Mint",
        grade: data.gradeLabel ? `${data.company} ${data.gradeLabel} ${data.grade}` : `${data.company} ${data.grade}`,
        set_name: data.setName ?? null,
        card_number: data.cardNumber ?? null,
        cert_number: data.certNumber,
        notes: [data.variety, data.year ? `Year: ${data.year}` : null].filter(Boolean).join(" · ") || null,
        market: data.market,
        cost: null,
      });
      showToast(`${data.name} added to inventory`);
      if (!card) {
        setBatch((prev) => [
          { ...data, id: crypto.randomUUID(), offerPct: selectedPct, addedAt: new Date().toISOString() },
          ...prev,
        ]);
        setBatchOpen(true);
        resetForNext();
      } else {
        setBatch((prev) => prev.filter((b) => b.id !== card.id));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add", false);
    } finally {
      setActionLoading(false);
    }
  }

  // ── Record buy ────────────────────────────────────────────────────────────

  function openBuyModal(bulk: boolean) {
    setBulkBuyMode(bulk);
    setBuyPaymentType("cash");
    setBuyOwner("shared");
    setBuyModalOpen(true);
  }

  async function handleConfirmBuy() {
    setActionLoading(true);
    setBuyModalOpen(false);
    try {
      const cards: CertBuyItem[] = bulkBuyMode
        ? batch.map((b) => ({
            certNumber: b.certNumber,
            company: b.company,
            grade: b.grade,
            gradeLabel: b.gradeLabel,
            name: b.name,
            setName: b.setName,
            cardNumber: b.cardNumber,
            market: b.market,
            cost: parseFloat((((b.market ?? 0) * b.offerPct) / 100).toFixed(2)),
            owner: buyOwner,
          }))
        : result
        ? [{
            certNumber: result.certNumber,
            company: result.company,
            grade: result.grade,
            gradeLabel: result.gradeLabel,
            name: result.name,
            setName: result.setName,
            cardNumber: result.cardNumber,
            market: result.market,
            cost: parseFloat((((result.market ?? 0) * selectedPct) / 100).toFixed(2)),
            owner: buyOwner,
          }]
        : [];

      if (!cards.length) return;
      const totalCost = cards.reduce((s, c) => s + c.cost, 0);

      await recordCertBuy({ cards, totalCost, paidBy: buyOwner === "shared" ? "shared" : buyOwner, paymentType: buyPaymentType });

      showToast(
        bulkBuyMode
          ? `${cards.length} slabs recorded — total ${money(totalCost)}`
          : `Recorded: ${cards[0].name} at ${money(cards[0].cost)}`
      );

      if (bulkBuyMode) {
        setBatch([]);
      } else {
        setBatch((prev) => [{
          ...(result as CertLookupResult),
          id: crypto.randomUUID(),
          offerPct: selectedPct,
          addedAt: new Date().toISOString(),
        }, ...prev]);
        setBatchOpen(true);
        resetForNext();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Buy failed", false);
    } finally {
      setActionLoading(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function buildBatchItem(r: CertLookupResult, _certNum: string): BatchItem {
    return { ...r, id: crypto.randomUUID(), offerPct: selectedPct, addedAt: new Date().toISOString() };
  }

  const batchTotalMarket = batch.reduce((s, b) => s + (b.market ?? 0), 0);
  const batchTotalOffer = batch.reduce((s, b) => s + ((b.market ?? 0) * b.offerPct) / 100, 0);

  // Derive display values from selected company + grade cache
  const displayKey = cacheKey(selectedViewCompany, selectedGrade);
  const displayGrade = gradeCache[displayKey];
  const displayMarket = displayGrade?.market ?? null;
  const displayCompCount = displayGrade?.compCount ?? 0;
  const displayListings: ActiveListingsState = displayGrade?.listings ?? { items: [], lowest: null, loading: !!selectedGrade };
  const displaySold: SoldState = displayGrade?.sold ?? { items: [], pricing: null, loading: !!selectedGrade, showAll: false };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-lg mx-auto space-y-3 pb-24 overflow-x-hidden">

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium ${
          toast.ok ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
        }`}>
          {toast.ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-lg font-semibold">Cert Scan</h1>
        {history.length > 0 && (
          <button
            onClick={() => setHistoryOpen((o) => !o)}
            className="p-2 rounded-lg opacity-40 hover:opacity-80 transition-opacity"
            aria-label="Scan history"
          >
            <History size={16} />
          </button>
        )}
      </div>

      {/* ── Company pills ── */}
      <CompanyToggle value={company} onChange={setCompany} />

      {/* ── Camera + manual input (idle phase) ── */}
      {phase === "idle" && (
        <div className="space-y-2">
          {/* Viewfinder */}
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3]">
            <div
              id="cert-scanner-container"
              className="w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
            />
            {/* Static guide overlay */}
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              <div className="absolute inset-0" style={{
                background: "radial-gradient(ellipse 70% 28% at 50% 50%, transparent 52%, rgba(0,0,0,0.68) 100%)"
              }} />
              {/* Target rectangle — wide for 1D barcodes */}
              <div
                className="relative z-10 w-64 h-14 rounded-lg"
                style={{ border: "2px solid rgba(255,255,255,0.8)" }}
              />
            </div>
            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
                <div className="text-white/60 text-xs text-center px-6">{cameraError}</div>
              </div>
            )}
          </div>

          {/* Manual input */}
          <div className="flex gap-2">
            <input
              ref={manualInputRef}
              type="text"
              inputMode="numeric"
              value={manualCert}
              onChange={(e) => setManualCert(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") handleManualSubmit(); }}
              placeholder="Cert number"
              className="flex-1 bg-background border rounded-xl px-4 py-2.5 text-sm tracking-wider font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              autoComplete="off"
            />
            <button
              onClick={handleManualSubmit}
              disabled={manualCert.length < 5}
              className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white text-sm font-medium transition-colors"
            >
              Look up
            </button>
          </div>
        </div>
      )}

      {/* ── Lookup loading ── */}
      {phase === "lookup" && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 size={32} className="animate-spin opacity-40" />
          <div className="text-sm opacity-50">Looking up #{manualCert}…</div>
        </div>
      )}

      {/* ── Manual fallback (cert lookup failed) ── */}
      {phase === "manual_details" && (
        <div className="border rounded-2xl p-4 space-y-4">
          <div className="flex items-start gap-2">
            <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium">Cert lookup failed</div>
              <div className="text-xs opacity-50 mt-0.5">
                {result?.lookupError ?? "Enter card details to get pricing."}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-xs opacity-50 block mb-1">Card Name *</label>
              <input value={fallbackName} onChange={(e) => setFallbackName(e.target.value)}
                placeholder="e.g. Charizard"
                className="w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                autoFocus />
            </div>
            <div>
              <label className="text-xs opacity-50 block mb-1">Grade *</label>
              <input value={fallbackGrade} onChange={(e) => setFallbackGrade(e.target.value)}
                placeholder="e.g. 10"
                className="w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
            </div>
            <div>
              <label className="text-xs opacity-50 block mb-1">Card # (optional)</label>
              <input value={fallbackCardNum} onChange={(e) => setFallbackCardNum(e.target.value)}
                placeholder="e.g. 4/102"
                className="w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
            </div>
            <div>
              <label className="text-xs opacity-50 block mb-1">Set (optional)</label>
              <input value={fallbackSet} onChange={(e) => setFallbackSet(e.target.value)}
                placeholder="e.g. Base Set"
                className="w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
            </div>
            <div>
              <label className="text-xs opacity-50 block mb-1">Override Market $</label>
              <input type="number" value={fallbackMarket} onChange={(e) => setFallbackMarket(e.target.value)}
                placeholder="optional"
                className="w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleFallbackLookup}
              disabled={!fallbackName.trim() || !fallbackGrade.trim()}
              className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white text-sm font-medium transition-colors">
              Get Pricing
            </button>
            <button onClick={resetForNext}
              className="px-4 py-2.5 rounded-xl border text-sm opacity-60 hover:opacity-100 transition-opacity">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Result ── */}
      {phase === "result" && result && (
        <div ref={resultRef} className="space-y-3">

          {/* New scan button */}
          <button
            onClick={resetForNext}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-violet-500/40 text-violet-400 text-sm font-medium hover:bg-violet-500/10 transition-colors"
          >
            <ScanLine size={15} />
            New Scan
          </button>

          {/* Card header */}
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="text-lg font-semibold leading-snug flex-1 min-w-0">{result.name || "—"}</div>
              {/* Scanned cert: company + grade + pop */}
              <div className="flex flex-col items-end shrink-0 gap-0.5">
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ background: "var(--accent-primary)", color: "#fff" }}
                >
                  {result.company} {result.gradeLabel ?? ""} {result.grade}
                  {result.population != null && (
                    <> · Pop {result.population.toLocaleString()}</>
                  )}
                </span>
                {result.populationHigher === 0 && (
                  <span className="text-[10px] text-amber-400 font-semibold">None graded higher</span>
                )}
                {result.populationHigher != null && result.populationHigher > 0 && (
                  <span className="text-[10px] opacity-40">{result.populationHigher.toLocaleString()} graded higher</span>
                )}
                {/* Show pop source label when viewing a different company */}
                {result.population != null && selectedViewCompany !== result.company && (
                  <span className="text-[10px] opacity-30">{result.company} pop data</span>
                )}
              </div>
            </div>
            <div className="text-sm opacity-50 mt-0.5">
              {[
                result.setName,
                result.cardNumber ? `#${result.cardNumber}` : null,
                result.year,
                result.isJapanese ? "Japanese" : null,
              ].filter(Boolean).join(" · ")}
            </div>
            {result.variety && (
              <div className="text-xs opacity-40 italic mt-0.5">{result.variety}</div>
            )}
            <div className="text-xs opacity-30 mt-0.5">#{result.certNumber}</div>
          </div>

          {/* Grade tabs — horizontal scroll */}
          <div
            ref={gradeScrollRef}
            className="flex gap-1.5 overflow-x-auto pb-0.5"
            style={{ scrollbarWidth: "none" } as CSSProperties}
          >
            {[...GRADE_LADDER].reverse().map((g) => {
              const isSelected = g === selectedGrade;
              const k = cacheKey(selectedViewCompany, g);
              const cached = gradeCache[k];
              const isFetching = fetchingGrades.current.has(k) || (cached?.listings.loading ?? false);
              return (
                <button
                  key={g}
                  data-grade={g}
                  onClick={() => handleGradeSelect(g)}
                  className={`shrink-0 min-w-[34px] px-2 py-1 rounded-full text-xs font-bold transition-all relative ${
                    isSelected
                      ? "text-white"
                      : "border border-border text-muted-foreground hover:text-foreground"
                  }`}
                  style={isSelected ? { background: "var(--accent-primary)" } : {}}
                >
                  {g}
                  {isFetching && !isSelected && (
                    <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-violet-400 opacity-60" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Company tabs */}
          <div className="flex gap-1.5">
            {(["PSA", "BGS", "CGC", "TAG"] as GradingCompany[]).map((co) => {
              const isSelected = co === selectedViewCompany;
              return (
                <button
                  key={co}
                  onClick={() => handleCompanySelect(co)}
                  className={`flex-1 py-1 rounded-full text-xs font-bold transition-all ${
                    isSelected
                      ? "text-white"
                      : "border border-border text-muted-foreground hover:text-foreground"
                  }`}
                  style={isSelected ? { background: "var(--accent-primary)" } : {}}
                >
                  {co}
                </button>
              );
            })}
          </div>

          {/* Market + Lowest listed */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="bg-black/5 dark:bg-white/5 rounded-xl px-3 py-2.5">
              <div className="text-xs opacity-40 mb-0.5">Market (median)</div>
              {displayGrade?.listings.loading && displayMarket == null ? (
                <div className="h-8 mt-0.5 w-24 bg-black/10 dark:bg-white/10 rounded animate-pulse" />
              ) : (
                <div
                  className="text-2xl font-bold"
                  style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                >
                  {displayMarket != null ? (
                    <span className={displayMarket >= 200 ? "text-amber-400" : ""}>{money(displayMarket)}</span>
                  ) : (
                    <span className="text-base opacity-30">—</span>
                  )}
                </div>
              )}
              <div className="text-xs opacity-40 mt-0.5">
                {displayCompCount > 0 ? `${displayCompCount} comps` : "no data"}
              </div>
            </div>
            <div className="bg-black/5 dark:bg-white/5 rounded-xl px-3 py-2.5">
              <div className="text-xs opacity-40 mb-0.5">Lowest listed</div>
              {displayListings.loading ? (
                <div className="h-8 mt-0.5 w-20 bg-black/10 dark:bg-white/10 rounded animate-pulse" />
              ) : (
                <div
                  className="text-2xl font-bold text-emerald-400"
                  style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                >
                  {displayListings.lowest != null ? money(displayListings.lowest) : <span className="text-base opacity-30">—</span>}
                </div>
              )}
              <div className="text-xs opacity-40 mt-0.5">
                {!displayListings.loading && displayListings.items.length > 0
                  ? `${displayListings.items.length} active`
                  : ""}
              </div>
            </div>
          </div>

          {/* Offer calculator */}
          <OfferCalc market={displayMarket} selectedPct={selectedPct} onSelectPct={setSelectedPct} />

          {/* Recent sold */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest opacity-40 mb-2">
              Recent Sales
            </div>
            {displaySold.loading ? (
              <div className="space-y-1.5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-9 bg-black/5 dark:bg-white/5 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : displaySold.items.length === 0 ? (
              <div className="text-xs opacity-30 py-2">No sold data found</div>
            ) : (
              <div className="divide-y border rounded-xl overflow-hidden">
                {(displaySold.showAll ? displaySold.items : displaySold.items.slice(0, 5)).map((s, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2.5">
                    <ListingTypeBadge types={s.buyingOptions} />
                    <div className="text-xs opacity-40 shrink-0">
                      {s.soldDate
                        ? new Date(s.soldDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                        : ""}
                    </div>
                    <div className="flex-1" />
                    <div
                      className="font-bold text-sm"
                      style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                    >
                      {money(s.price)}
                    </div>
                    {s.itemUrl && (
                      <a
                        href={s.itemUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="opacity-30 hover:opacity-80 transition-opacity"
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                ))}
                {displaySold.items.length > 5 && (
                  <button
                    onClick={() =>
                      setGradeCache((prev) => {
                        const g = prev[displayKey];
                        if (!g) return prev;
                        return { ...prev, [displayKey]: { ...g, sold: { ...g.sold, showAll: !g.sold.showAll } } };
                      })
                    }
                    className="w-full py-2 text-xs opacity-40 hover:opacity-70 transition-opacity"
                  >
                    {displaySold.showAll ? "Show less" : `${displaySold.items.length - 5} more`}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Active listings — sorted low→high */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest opacity-40 mb-2">
              Active Listings
            </div>
            {displayListings.loading ? (
              <div className="space-y-1.5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-9 bg-black/5 dark:bg-white/5 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : displayListings.items.length === 0 ? (
              <div className="text-xs opacity-30 py-2">No active listings found</div>
            ) : (
              <div className="divide-y border rounded-xl overflow-hidden">
                {displayListings.items.slice(0, 5).map((l, i) => (
                  <a
                    key={i}
                    href={l.itemUrl ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-2 px-3 py-2.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${i === 0 ? "bg-emerald-500/5" : ""} ${l.itemUrl ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <ListingTypeBadge types={l.buyingOptions} />
                    {l.bidCount != null && l.bidCount > 0 && (
                      <span className="text-xs opacity-40 shrink-0">{l.bidCount} bids</span>
                    )}
                    <div className="flex-1 min-w-0 text-xs opacity-40 truncate">{l.title}</div>
                    <div
                      className={`font-bold text-sm shrink-0 ${i === 0 ? "text-emerald-400" : ""}`}
                      style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                    >
                      {money(l.price)}
                    </div>
                    <ExternalLink size={12} className="opacity-20 shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleAddToInventory()}
              disabled={actionLoading}
              className="flex items-center justify-center gap-2 py-3.5 rounded-xl border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 font-medium text-sm transition-colors disabled:opacity-40"
            >
              <Package size={16} />
              Add to Inventory
            </button>
            <button
              onClick={() => openBuyModal(false)}
              disabled={actionLoading}
              className="flex items-center justify-center gap-2 py-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 font-medium text-sm transition-colors disabled:opacity-40"
            >
              <ShoppingCart size={16} />
              Record Buy
            </button>
            <button
              onClick={() => {
                setBatch((prev) => [buildBatchItem(result, result.certNumber), ...prev]);
                setBatchOpen(true);
                resetForNext();
              }}
              className="col-span-2 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium text-sm transition-colors"
            >
              <ScanLine size={16} />
              Scan Next
            </button>
            <button
              onClick={resetForNext}
              className="col-span-2 text-xs opacity-40 hover:opacity-70 transition-opacity py-1"
            >
              Pass / dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── Batch list ── */}
      {batch.length > 0 && (
        <div className="border rounded-2xl overflow-hidden">
          <button
            onClick={() => setBatchOpen((o) => !o)}
            className="w-full flex items-center justify-between p-3.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ScanLine size={15} className="opacity-60" />
              <span className="text-sm font-medium">
                {batch.length} card{batch.length !== 1 ? "s" : ""} scanned
              </span>
              <span className="text-xs opacity-50">
                · Market {money(batchTotalMarket)} · Offer {money(batchTotalOffer)}
              </span>
            </div>
            {batchOpen ? <ChevronUp size={15} className="opacity-40" /> : <ChevronDown size={15} className="opacity-40" />}
          </button>

          {batchOpen && (
            <div className="border-t">
              <div className="divide-y">
                {batch.map((item, i) => (
                  <div key={item.id} className="flex items-center gap-2 px-3.5 py-3">
                    <div className="w-5 h-5 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center text-xs opacity-50 shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.name}</div>
                      <div className="text-xs opacity-50">
                        {item.company} {item.grade}
                        {item.cardNumber ? ` · #${item.cardNumber}` : ""}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold" style={{ fontFamily: "var(--font-space-mono, monospace)" }}>
                        {money(item.market)}
                      </div>
                      <div className="text-xs opacity-50">
                        {item.offerPct}% = {offerAmount(item.market, item.offerPct)}
                      </div>
                    </div>
                    <button
                      onClick={() => setBatch((prev) => prev.filter((b) => b.id !== item.id))}
                      className="shrink-0 p-1 rounded-lg opacity-30 hover:opacity-70 transition-opacity"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="border-t p-3.5 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="opacity-60">Total market</span>
                  <span className="font-bold" style={{ fontFamily: "var(--font-space-mono, monospace)" }}>
                    {money(batchTotalMarket)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="opacity-60">Total at avg offer %</span>
                  <span className="font-bold text-violet-500" style={{ fontFamily: "var(--font-space-mono, monospace)" }}>
                    {money(batchTotalOffer)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    onClick={() => batch.forEach((b) => handleAddToInventory(b))}
                    disabled={actionLoading}
                    className="py-3 rounded-xl border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 text-sm font-medium transition-colors disabled:opacity-40"
                  >
                    Add All
                  </button>
                  <button
                    onClick={() => openBuyModal(true)}
                    disabled={actionLoading}
                    className="py-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 text-sm font-medium transition-colors disabled:opacity-40"
                  >
                    Bulk Buy
                  </button>
                </div>
                <button
                  onClick={() => setBatch([])}
                  className="w-full text-xs opacity-30 hover:opacity-60 transition-opacity py-1 flex items-center justify-center gap-1"
                >
                  <Trash2 size={11} />
                  Clear list
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── History slide-in ── */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setHistoryOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative bg-background border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <div className="text-sm font-semibold">Recent Scans</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (confirm("Clear scan history?")) {
                      setHistory([]);
                      localStorage.removeItem(HISTORY_KEY);
                      setHistoryOpen(false);
                    }
                  }}
                  className="text-xs opacity-30 hover:opacity-60 transition-opacity"
                >
                  Clear
                </button>
                <button onClick={() => setHistoryOpen(false)} className="p-1 rounded-lg opacity-40 hover:opacity-100">
                  <X size={15} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto divide-y">
              {history.slice(0, 50).map((h) => (
                <button
                  key={h.id}
                  onClick={() => {
                    setManualCert(h.certNumber);
                    setCompany(h.company);
                    setHistoryOpen(false);
                    handleCertDetected(h.certNumber);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{h.name}</div>
                    <div className="text-xs opacity-50">
                      {h.company} {h.grade} · #{h.certNumber}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className="text-sm font-bold opacity-80"
                      style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                    >
                      {money(h.market)}
                    </div>
                    <div className="text-xs opacity-40">
                      {new Date(h.scannedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </div>
                  </div>
                  <RefreshCw size={13} className="shrink-0 opacity-20" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Buy modal ── */}
      {buyModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setBuyModalOpen(false); }}
        >
          <div className="w-full max-w-sm bg-background border rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="font-semibold">
                {bulkBuyMode ? `Bulk Buy (${batch.length} slabs)` : "Record Buy"}
              </div>
              <button onClick={() => setBuyModalOpen(false)} className="p-1.5 rounded-lg opacity-40 hover:opacity-100">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {bulkBuyMode ? (
                <div className="bg-black/5 dark:bg-white/5 rounded-xl p-3 text-sm">
                  <div className="flex justify-between mb-1">
                    <span className="opacity-60">Cards</span>
                    <span className="font-medium">{batch.length}</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span className="opacity-60">Total market</span>
                    <span className="font-medium">{money(batchTotalMarket)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Total cost</span>
                    <span className="text-emerald-500" style={{ fontFamily: "var(--font-space-mono, monospace)" }}>
                      {money(batchTotalOffer)}
                    </span>
                  </div>
                </div>
              ) : result ? (
                <div className="bg-black/5 dark:bg-white/5 rounded-xl p-3 text-sm">
                  <div className="font-medium">{result.name}</div>
                  <div className="opacity-60 text-xs mt-0.5">
                    {result.company} {result.gradeLabel ? `${result.gradeLabel} ${result.grade}` : result.grade}
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="opacity-60">Market: {money(result.market)}</span>
                    <span className="font-semibold text-emerald-500" style={{ fontFamily: "var(--font-space-mono, monospace)" }}>
                      {selectedPct}% = {offerAmount(result.market, selectedPct)}
                    </span>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs opacity-50 block mb-1">Payment</label>
                  <select
                    value={buyPaymentType}
                    onChange={(e) => setBuyPaymentType(e.target.value)}
                    className="w-full bg-background border rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                  >
                    <option value="cash">Cash</option>
                    <option value="venmo">Venmo</option>
                    <option value="paypal">PayPal</option>
                    <option value="zelle">Zelle</option>
                    <option value="trade">Trade</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs opacity-50 block mb-1">Owner</label>
                  <select
                    value={buyOwner}
                    onChange={(e) => setBuyOwner(e.target.value as "alex" | "mila" | "shared")}
                    className="w-full bg-background border rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                  >
                    <option value="shared">Shared</option>
                    <option value="alex">Alex</option>
                    <option value="mila">Mila</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleConfirmBuy}
                disabled={actionLoading}
                className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white font-semibold text-sm transition-colors"
              >
                {actionLoading ? "Recording…" : "Confirm Buy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

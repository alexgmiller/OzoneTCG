"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Camera,
  Keyboard,
  X,
  ScanLine,
  RefreshCw,
  Package,
  ShoppingCart,
  Trash2,
  ChevronDown,
  ChevronUp,
  History,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { createItem } from "@/app/protected/inventory/actions";
import { recordCertBuy, type CertBuyItem } from "@/app/protected/transactions/actions";
import type { CertLookupResult, GradingCompany } from "@/app/api/cert-lookup/route";

// ── Constants ─────────────────────────────────────────────────────────────────

const OFFER_PRESETS = [60, 65, 70, 75, 80];
const HISTORY_KEY = "ozone_cert_scan_history";
const MAX_HISTORY = 50;

// ── Types ─────────────────────────────────────────────────────────────────────

type ScanPhase = "idle" | "lookup" | "result" | "manual_details";
type InputMode = "camera" | "manual";

interface BatchItem extends CertLookupResult {
  id: string;
  offerPct: number;
  manualName?: string;
  manualGrade?: string;
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
    <div className="flex gap-1 p-0.5 rounded-lg bg-black/10 dark:bg-white/10">
      {(["PSA", "BGS", "CGC"] as GradingCompany[]).map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`flex-1 text-xs font-semibold py-1 rounded-md transition-all ${
            value === c
              ? "bg-white dark:bg-white/20 shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {c}
        </button>
      ))}
    </div>
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
      <div className="flex gap-2 flex-wrap">
        {OFFER_PRESETS.map((pct) => (
          <button
            key={pct}
            onClick={() => onSelectPct(pct)}
            className={`flex-1 min-w-[72px] py-3 rounded-xl border text-center transition-all ${
              selectedPct === pct
                ? "border-violet-500 bg-violet-500/15 dark:bg-violet-500/20"
                : "border-border hover:border-violet-400 bg-background"
            }`}
          >
            <div className="text-xs opacity-60">{pct}%</div>
            <div
              className="text-base font-bold"
              style={{ fontFamily: "var(--font-space-mono, monospace)" }}
            >
              {offerAmount(market, pct)}
            </div>
          </button>
        ))}
      </div>

      {/* Custom % */}
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
          <div
            className="text-sm font-bold"
            style={{ fontFamily: "var(--font-space-mono, monospace)" }}
          >
            = {offerAmount(market, parseFloat(customVal) || 0)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CertScanner() {
  // ── phase / mode
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [inputMode, setInputMode] = useState<InputMode>("camera");
  const [company, setCompany] = useState<GradingCompany>("PSA");

  // ── manual input
  const [manualCert, setManualCert] = useState("");
  const manualInputRef = useRef<HTMLInputElement>(null);

  // ── camera
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<{ stop: () => void } | null>(null);
  const detectedRef = useRef(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // ── result state
  const [result, setResult] = useState<CertLookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

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

  // ── modals
  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [buyPaymentType, setBuyPaymentType] = useState("cash");
  const [buyOwner, setBuyOwner] = useState<"alex" | "mila" | "shared">("shared");
  const [bulkBuyMode, setBulkBuyMode] = useState(false); // whether we're recording batch or single

  // ── Load history ──────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) setHistory(JSON.parse(stored));
    } catch {}
  }, []);

  function saveToHistory(entry: HistoryEntry) {
    setHistory((prev) => {
      const updated = [entry, ...prev.filter((h) => h.id !== entry.id)].slice(
        0,
        MAX_HISTORY
      );
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }

  // ── Camera scanning ───────────────────────────────────────────────────────

  useEffect(() => {
    if (inputMode !== "camera" || phase !== "idle") {
      // Stop any active scanner
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
      setCameraReady(false);
      return;
    }

    detectedRef.current = false;
    setCameraError(null);
    setCameraReady(false);
    let mounted = true;

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");

        const hints = new Map();
        hints.set(DecodeHintType.TRY_HARDER, true);
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.DATA_MATRIX,
        ]);

        const reader = new BrowserMultiFormatReader(hints);

        if (!videoRef.current || !mounted) return;

        const controls = await reader.decodeFromVideoDevice(
          undefined, // rear camera on mobile
          videoRef.current,
          (scanResult, _error) => {
            if (!mounted || detectedRef.current) return;
            if (scanResult) {
              const text = scanResult.getText().trim();
              // Extract digit sequences — cert numbers are 7-12 digits
              const cleaned = text.replace(/\D/g, "");
              if (cleaned.length >= 7 && cleaned.length <= 12) {
                detectedRef.current = true;
                controls.stop();
                scannerControlsRef.current = null;
                handleCertDetected(cleaned);
              }
            }
          }
        );

        if (mounted) {
          scannerControlsRef.current = controls;
          setCameraReady(true);
        } else {
          controls.stop();
        }
      } catch (err) {
        if (mounted) {
          const msg =
            err instanceof Error && err.name === "NotAllowedError"
              ? "Camera access denied — use manual entry"
              : "Camera not available — use manual entry";
          setCameraError(msg);
          setInputMode("manual");
        }
      }
    })();

    return () => {
      mounted = false;
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMode, phase]);

  // ── Cert lookup ───────────────────────────────────────────────────────────

  const handleCertDetected = useCallback(
    async (certNumber: string) => {
      setManualCert(certNumber);
      setPhase("lookup");
      setResult(null);
      setLookupError(null);

      try {
        const res = await fetch("/api/cert-lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ certNumber, company }),
        });
        const data: CertLookupResult = await res.json();

        if (data.lookupFailed) {
          // Show manual entry form pre-filled with cert number
          setResult(data);
          setFallbackName("");
          setFallbackGrade("");
          setFallbackSet("");
          setFallbackCardNum("");
          setFallbackMarket("");
          setPhase("manual_details");
        } else {
          setResult(data);
          setPhase("result");
          // Save to history
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
        }
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

    try {
      // Re-use the cert-lookup route: send dummy cert, it'll fail fast
      // then we do a direct price search with known card details
      const res = await fetch("/api/cert-price-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fallbackName.trim(),
          company,
          grade: fallbackGrade.trim(),
          setName: fallbackSet.trim() || null,
          cardNumber: fallbackCardNum.trim() || null,
        }),
      });
      const data = await res.json();

      setResult({
        certNumber: result?.certNumber ?? "",
        company,
        name: fallbackName.trim(),
        setName: fallbackSet.trim() || null,
        cardNumber: fallbackCardNum.trim() || null,
        grade: fallbackGrade.trim(),
        market: data.market ?? null,
        compCount: data.compCount ?? 0,
        lookupFailed: false,
      });
      if (fallbackMarket) {
        setResult((prev) =>
          prev ? { ...prev, market: parseFloat(fallbackMarket) || prev.market } : prev
        );
      }
      setPhase("result");
    } catch {
      // Build partial result from manual inputs
      setResult({
        certNumber: result?.certNumber ?? "",
        company,
        name: fallbackName.trim(),
        setName: fallbackSet.trim() || null,
        cardNumber: fallbackCardNum.trim() || null,
        grade: fallbackGrade.trim(),
        market: fallbackMarket ? parseFloat(fallbackMarket) : null,
        compCount: 0,
        lookupFailed: false,
      });
      setPhase("result");
    }
  }

  // ── Reset / scan next ─────────────────────────────────────────────────────

  function resetForNext() {
    setPhase("idle");
    setResult(null);
    setLookupError(null);
    setManualCert("");
    setFallbackName("");
    setFallbackGrade("");
    setFallbackMarket("");
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

  // ── Record buy (opens modal) ──────────────────────────────────────────────

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
            cost: parseFloat(
              (((b.market ?? 0) * b.offerPct) / 100).toFixed(2)
            ),
            owner: buyOwner,
          }))
        : result
        ? [
            {
              certNumber: result.certNumber,
              company: result.company,
              grade: result.grade,
              gradeLabel: result.gradeLabel,
              name: result.name,
              setName: result.setName,
              cardNumber: result.cardNumber,
              market: result.market,
              cost: parseFloat(
                (((result.market ?? 0) * selectedPct) / 100).toFixed(2)
              ),
              owner: buyOwner,
            },
          ]
        : [];

      if (!cards.length) return;

      const totalCost = cards.reduce((s, c) => s + c.cost, 0);

      await recordCertBuy({
        cards,
        totalCost,
        paidBy: buyOwner === "shared" ? "shared" : buyOwner,
        paymentType: buyPaymentType,
      });

      showToast(
        bulkBuyMode
          ? `${cards.length} slabs recorded — total ${money(totalCost)}`
          : `Recorded: ${cards[0].name} at ${money(cards[0].cost)}`
      );

      if (bulkBuyMode) {
        setBatch([]);
      } else {
        setBatch((prev) => [
          {
            ...(result as CertLookupResult),
            id: crypto.randomUUID(),
            offerPct: selectedPct,
            addedAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        setBatchOpen(true);
        resetForNext();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Buy failed", false);
    } finally {
      setActionLoading(false);
    }
  }

  // ── Build batch item from result ──────────────────────────────────────────

  function buildBatchItem(r: CertLookupResult, _certNum: string): BatchItem {
    return {
      ...r,
      id: crypto.randomUUID(),
      offerPct: selectedPct,
      addedAt: new Date().toISOString(),
    };
  }

  // ── Batch totals ──────────────────────────────────────────────────────────

  const batchTotalMarket = batch.reduce((s, b) => s + (b.market ?? 0), 0);
  const batchTotalOffer = batch.reduce(
    (s, b) => s + ((b.market ?? 0) * b.offerPct) / 100,
    0
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-24">
      {/* ── Toast ── */}
      {toast && (
        <div
          className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium transition-all ${
            toast.ok
              ? "bg-emerald-600 text-white"
              : "bg-rose-600 text-white"
          }`}
        >
          {toast.ok ? (
            <CheckCircle size={15} />
          ) : (
            <AlertCircle size={15} />
          )}
          {toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-xl font-semibold">Cert Scan</h1>
          <div className="text-xs opacity-50 mt-0.5">Scan a slab · see market value · make an offer</div>
        </div>
        {history.length > 0 && (
          <button
            onClick={() => setHistoryOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs opacity-50 hover:opacity-100 transition-opacity px-3 py-1.5 rounded-lg border"
          >
            <History size={13} />
            History
          </button>
        )}
      </div>

      {/* ── Company Toggle ── */}
      <CompanyToggle value={company} onChange={setCompany} />

      {/* ── Input Mode Toggle ── */}
      {phase === "idle" && (
        <div className="flex gap-2 p-0.5 rounded-xl bg-black/5 dark:bg-white/5">
          <button
            onClick={() => setInputMode("camera")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
              inputMode === "camera"
                ? "bg-white dark:bg-white/15 shadow-sm"
                : "opacity-50 hover:opacity-75"
            }`}
          >
            <Camera size={16} />
            Camera
          </button>
          <button
            onClick={() => {
              setInputMode("manual");
              setTimeout(() => manualInputRef.current?.focus(), 100);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
              inputMode === "manual"
                ? "bg-white dark:bg-white/15 shadow-sm"
                : "opacity-50 hover:opacity-75"
            }`}
          >
            <Keyboard size={16} />
            Manual
          </button>
        </div>
      )}

      {/* ── Camera Viewfinder ── */}
      {inputMode === "camera" && phase === "idle" && (
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3]">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            muted
            playsInline
            autoPlay
          />
          {/* Targeting overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {/* Corner brackets */}
            <div className="relative w-48 h-20">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white/80 rounded-tl-sm" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white/80 rounded-tr-sm" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white/80 rounded-bl-sm" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white/80 rounded-br-sm" />
              {/* Scan line animation */}
              {cameraReady && (
                <div className="absolute inset-x-0 animate-scan-line h-0.5 bg-violet-400/80 shadow-[0_0_8px_2px_rgba(139,92,246,0.6)]" />
              )}
            </div>
            <div className="mt-3 text-white/70 text-xs font-medium">
              {cameraReady ? "Point at barcode on slab label" : "Starting camera…"}
            </div>
          </div>
          {/* Dim edges */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: "radial-gradient(ellipse 55% 35% at 50% 50%, transparent 60%, rgba(0,0,0,0.55) 100%)"
          }} />
        </div>
      )}

      {/* ── Manual Cert Input ── */}
      {(inputMode === "manual" && phase === "idle") && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              ref={manualInputRef}
              type="text"
              inputMode="numeric"
              value={manualCert}
              onChange={(e) => setManualCert(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleManualSubmit();
              }}
              placeholder="Enter cert number (e.g. 12345678)"
              className="flex-1 bg-background border rounded-xl px-4 py-3 text-base tracking-wider font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              autoComplete="off"
              autoFocus
            />
            <button
              onClick={handleManualSubmit}
              disabled={manualCert.length < 5}
              className="px-4 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white font-medium transition-colors"
            >
              Look up
            </button>
          </div>
          <div className="text-xs opacity-40 text-center">
            Type the number printed on the cert label and press Enter
          </div>
        </div>
      )}

      {/* Switch to manual when scanning */}
      {phase === "idle" && inputMode === "camera" && (
        <button
          onClick={() => setInputMode("manual")}
          className="w-full text-xs opacity-40 hover:opacity-70 transition-opacity py-1"
        >
          Having trouble? Enter cert number manually →
        </button>
      )}

      {/* ── Lookup Loading ── */}
      {phase === "lookup" && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 size={36} className="animate-spin opacity-50" />
          <div className="text-sm opacity-60">Looking up cert #{manualCert}…</div>
        </div>
      )}

      {/* ── Manual Details Fallback (cert lookup failed) ── */}
      {phase === "manual_details" && (
        <div className="border rounded-2xl p-4 space-y-4">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium">Cert lookup failed</div>
              <div className="text-xs opacity-60 mt-0.5">
                {result?.lookupError ?? "Enter card details below to get pricing."}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-xs opacity-50 block mb-1">Card Name *</label>
              <input
                value={fallbackName}
                onChange={(e) => setFallbackName(e.target.value)}
                placeholder="e.g. Charizard"
                className="w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs opacity-50 block mb-1">Grade *</label>
              <input
                value={fallbackGrade}
                onChange={(e) => setFallbackGrade(e.target.value)}
                placeholder="e.g. 10"
                className="w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
            </div>
            <div>
              <label className="text-xs opacity-50 block mb-1">Card # (optional)</label>
              <input
                value={fallbackCardNum}
                onChange={(e) => setFallbackCardNum(e.target.value)}
                placeholder="e.g. 4/102"
                className="w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
            </div>
            <div>
              <label className="text-xs opacity-50 block mb-1">Set (optional)</label>
              <input
                value={fallbackSet}
                onChange={(e) => setFallbackSet(e.target.value)}
                placeholder="e.g. Base Set"
                className="w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
            </div>
            <div>
              <label className="text-xs opacity-50 block mb-1">Override Market $</label>
              <input
                type="number"
                value={fallbackMarket}
                onChange={(e) => setFallbackMarket(e.target.value)}
                placeholder="optional"
                className="w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleFallbackLookup}
              disabled={!fallbackName.trim() || !fallbackGrade.trim()}
              className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white text-sm font-medium transition-colors"
            >
              Get Pricing
            </button>
            <button
              onClick={resetForNext}
              className="px-4 py-2.5 rounded-xl border text-sm opacity-60 hover:opacity-100 transition-opacity"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Result Card ── */}
      {phase === "result" && result && (
        <div className="border rounded-2xl overflow-hidden">
          {/* Card header */}
          <div className="p-4 border-b">
            <div className="flex-1 min-w-0">
              <div className="text-lg font-semibold leading-snug">{result.name || "—"}</div>
              {/* Set · card# · year · language */}
              <div className="text-sm opacity-60 mt-0.5">
                {[
                  result.setName,
                  result.year ? `(${result.year})` : null,
                  result.cardNumber ? `#${result.cardNumber}` : null,
                  result.isJapanese ? "Japanese" : null,
                ].filter(Boolean).join(" · ")}
              </div>
              {/* Variety */}
              {result.variety && (
                <div className="text-xs opacity-50 mt-0.5 italic">{result.variety}</div>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-500">
                  {result.company} {result.gradeLabel ? `${result.gradeLabel} ${result.grade}` : result.grade}
                </span>
                <span className="text-xs opacity-40">#{result.certNumber}</span>
                {/* Population data */}
                {result.population != null && (
                  <span className="text-xs opacity-60">
                    Pop: <span className="font-semibold">{result.population.toLocaleString()}</span>
                  </span>
                )}
                {result.populationHigher === 0 && (
                  <span className="text-xs font-semibold text-amber-400">None graded higher</span>
                )}
                {result.populationHigher != null && result.populationHigher > 0 && (
                  <span className="text-xs opacity-50">
                    {result.populationHigher} higher
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Market value */}
          <div className="px-4 py-3 border-b bg-black/5 dark:bg-white/5">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest opacity-40 mb-0.5">
                  Market Value
                </div>
                <div
                  className="text-3xl font-bold"
                  style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                >
                  {result.market != null ? (
                    <span className={result.market >= 200 ? "text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]" : ""}>
                      {money(result.market)}
                    </span>
                  ) : (
                    <span className="opacity-30 text-xl">No price data</span>
                  )}
                </div>
              </div>
              <div className="text-xs opacity-40 text-right">
                {result.compCount > 0 ? (
                  <>{result.compCount} eBay comps<br />just now</>
                ) : (
                  "No eBay comps found"
                )}
              </div>
            </div>
          </div>

          {/* Offer calculator */}
          <div className="px-4 py-3 border-b">
            <OfferCalc
              market={result.market}
              selectedPct={selectedPct}
              onSelectPct={setSelectedPct}
            />
          </div>

          {/* Actions */}
          <div className="p-3 grid grid-cols-2 gap-2">
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
                setBatch((prev) => [
                  buildBatchItem(result, result.certNumber),
                  ...prev,
                ]);
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

      {/* ── Batch List ── */}
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
                      <div
                        className="text-sm font-bold"
                        style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                      >
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

              {/* Batch totals + actions */}
              <div className="border-t p-3.5 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="opacity-60">Total market value</span>
                  <span
                    className="font-bold"
                    style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                  >
                    {money(batchTotalMarket)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="opacity-60">Total at avg offer %</span>
                  <span
                    className="font-bold text-violet-500"
                    style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                  >
                    {money(batchTotalOffer)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    onClick={() => {
                      batch.forEach((b) => handleAddToInventory(b));
                    }}
                    disabled={actionLoading}
                    className="py-3 rounded-xl border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 text-sm font-medium transition-colors disabled:opacity-40"
                  >
                    Add All to Inventory
                  </button>
                  <button
                    onClick={() => openBuyModal(true)}
                    disabled={actionLoading}
                    className="py-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 text-sm font-medium transition-colors disabled:opacity-40"
                  >
                    Record Bulk Buy
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

      {/* ── Scan History ── */}
      {historyOpen && history.length > 0 && (
        <div className="border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between p-3.5 border-b">
            <div className="text-sm font-medium">Recent Scans</div>
            <button
              onClick={() => setHistoryOpen(false)}
              className="p-1 rounded-lg opacity-40 hover:opacity-100 transition-opacity"
            >
              <X size={14} />
            </button>
          </div>
          <div className="divide-y max-h-72 overflow-y-auto">
            {history.slice(0, 30).map((h) => (
              <button
                key={h.id}
                onClick={() => {
                  setManualCert(h.certNumber);
                  setCompany(h.company);
                  setHistoryOpen(false);
                  handleCertDetected(h.certNumber);
                }}
                className="w-full flex items-center gap-3 px-3.5 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
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
                    {new Date(h.scannedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                </div>
                <RefreshCw size={13} className="shrink-0 opacity-30" />
              </button>
            ))}
          </div>
          {history.length > 0 && (
            <div className="border-t p-2 text-center">
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
                Clear history
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Buy Modal ── */}
      {buyModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setBuyModalOpen(false);
          }}
        >
          <div className="w-full max-w-sm bg-background border rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="font-semibold">
                {bulkBuyMode ? `Record Bulk Buy (${batch.length} slabs)` : "Record Buy"}
              </div>
              <button
                onClick={() => setBuyModalOpen(false)}
                className="p-1.5 rounded-lg opacity-40 hover:opacity-100 transition-opacity"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {/* Buy summary */}
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
                    <span
                      className="text-emerald-500"
                      style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                    >
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
                    <span
                      className="font-semibold text-emerald-500"
                      style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                    >
                      Buying at {selectedPct}% = {offerAmount(result.market, selectedPct)}
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
                    onChange={(e) =>
                      setBuyOwner(e.target.value as "alex" | "mila" | "shared")
                    }
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

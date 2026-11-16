"use client";

import { useEffect, useRef, useState } from "react";
import { History, Loader2 } from "lucide-react";
import type { CertLookupResult, GradingCompany } from "@/app/api/cert-lookup/route";
import { createItem } from "@/app/protected/inventory/actions";
import { recordBuy } from "@/app/protected/pos/actions";
import type { PaymentMethod } from "@/app/protected/pos/ledger";
import { getActiveShow } from "@/app/protected/shows/actions";
import type { PricingStrategyOverride } from "@/lib/fmv";
import { useConfirm, useToast } from "@/components/ui";
import { useCertLookup } from "./useCertLookup";
import { CompanyPicker } from "./CompanyPicker";
import { ScanIdle } from "./ScanIdle";
import { FallbackForm } from "./FallbackForm";
import { ResultCard } from "./ResultCard";
import { BatchList } from "./BatchList";
import { HistorySheet } from "./HistorySheet";
import { BuyModal } from "./BuyModal";
import {
  HISTORY_KEY, MAX_HISTORY, gradeString, money, offerValue,
  type BatchItem, type HistoryEntry, type Owner,
} from "./shared";

// ── CertScanner ──
// Orchestrates the scan → price → buy flow. Section UI lives in sibling files.

export default function CertScanner({
  pricingStrategy = "auto",
}: {
  pricingStrategy?: PricingStrategyOverride;
}) {
  const confirm = useConfirm();
  const toast = useToast();

  const [company, setCompany] = useState<GradingCompany>("PSA");
  const [selectedPct, setSelectedPct] = useState(70);
  const [actionLoading, setActionLoading] = useState(false);

  // ── batch + history
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // ── buy modal
  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [buyPayment, setBuyPayment] = useState<PaymentMethod>("cash");
  const [buyOwner, setBuyOwner] = useState<Owner>("shared");
  const [bulkBuyMode, setBulkBuyMode] = useState(false);

  const lookup = useCertLookup({
    company,
    pricingStrategy,
    onScanned: (r) =>
      saveToHistory({
        id: crypto.randomUUID(),
        certNumber: r.certNumber,
        company: r.company,
        grade: r.grade,
        name: r.name,
        market: r.market,
        offerPct: selectedPct,
        scannedAt: new Date().toISOString(),
      }),
    onError: (msg) => toast.error(msg),
  });
  const { phase, result } = lookup;

  // ── History persistence ──

  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) setHistory(JSON.parse(stored));
    } catch {}
  }, []);

  function saveToHistory(entry: HistoryEntry) {
    setHistory((prev) => {
      const updated = [entry, ...prev.filter((h) => h.id !== entry.id)].slice(0, MAX_HISTORY);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }

  async function clearHistory() {
    const ok = await confirm({
      title: "Clear scan history?",
      description: "Recent scans on this device will be removed.",
      confirmLabel: "Clear",
      destructive: true,
    });
    if (!ok) return;
    setHistory([]);
    try { localStorage.removeItem(HISTORY_KEY); } catch {}
    setHistoryOpen(false);
  }

  // ── Scroll the result into view when a lookup completes ──

  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (phase !== "result") return;
    const id = window.setTimeout(
      () => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      100,
    );
    return () => window.clearTimeout(id);
  }, [phase]);

  // ── Batch helpers ──

  function toBatchItem(r: CertLookupResult): BatchItem {
    return { ...r, id: crypto.randomUUID(), offerPct: selectedPct, addedAt: new Date().toISOString() };
  }

  function pushToBatchAndReset(r: CertLookupResult) {
    setBatch((prev) => [toBatchItem(r), ...prev]);
    setBatchOpen(true);
    lookup.reset();
  }

  const batchTotalMarket = batch.reduce((s, b) => s + (b.market ?? 0), 0);
  const batchTotalOffer = batch.reduce((s, b) => s + (offerValue(b.market, b.offerPct) ?? 0), 0);

  // ── Add to inventory ──

  async function handleAddToInventory(card?: BatchItem) {
    const data = card ?? result;
    if (!data) return;
    setActionLoading(true);
    try {
      await createItem({
        category: "slab",
        owner: "shared",
        status: "inventory",
        name: data.name,
        condition: "Near Mint",
        grade: gradeString(data),
        set_name: data.setName ?? null,
        card_number: data.cardNumber ?? null,
        cert_number: data.certNumber,
        notes: [data.variety, data.year ? `Year: ${data.year}` : null].filter(Boolean).join(" · ") || null,
        market: data.market,
        cost: null,
      });
      toast.success(`${data.name} added to inventory`);
      if (card) setBatch((prev) => prev.filter((b) => b.id !== card.id));
      else pushToBatchAndReset(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setActionLoading(false);
    }
  }

  // ── Record buy ──

  function openBuyModal(bulk: boolean) {
    setBulkBuyMode(bulk);
    setBuyPayment("cash");
    setBuyOwner("shared");
    setBuyModalOpen(true);
  }

  async function handleConfirmBuy() {
    const source: Array<CertLookupResult & { offerPct: number }> = bulkBuyMode
      ? batch
      : result ? [{ ...result, offerPct: selectedPct }] : [];
    if (!source.length) return;

    setActionLoading(true);
    setBuyModalOpen(false);
    try {
      const cards = source.map((c) => ({
        name: c.name,
        category: "slab" as const,
        cert_number: c.certNumber,
        market: c.market,
        cost: offerValue(c.market, c.offerPct) ?? 0,
        owner: buyOwner,
        grade: gradeString(c),
        set_name: c.setName ?? null,
        card_number: c.cardNumber ?? null,
      }));
      const total = cards.reduce((s, c) => s + c.cost, 0);

      const show = await getActiveShow();
      await recordBuy({
        cards,
        total,
        paid_by: buyOwner,
        payment_method: buyPayment,
        show_session_id: show?.id ?? null,
      });

      toast.success(
        bulkBuyMode
          ? `${cards.length} slabs recorded — total ${money(total)}`
          : `Recorded: ${cards[0].name} at ${money(cards[0].cost)}`,
      );

      if (bulkBuyMode) setBatch([]);
      else if (result) pushToBatchAndReset(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Buy failed");
    } finally {
      setActionLoading(false);
    }
  }

  // ── Render ──

  return (
    <div className="w-full max-w-lg mx-auto space-y-4 pb-24 overflow-x-hidden">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-lg font-semibold">Cert scan</h1>
        {history.length > 0 && (
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            aria-label="Scan history"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          >
            <History size={18} />
          </button>
        )}
      </div>

      {(phase === "idle" || phase === "manual_details") && (
        <CompanyPicker value={company} onChange={setCompany} />
      )}

      {phase === "idle" && (
        <ScanIdle
          manualCert={lookup.manualCert}
          onManualCertChange={lookup.setManualCert}
          onSubmit={lookup.submitManualCert}
          onDetected={(cert) => lookup.lookupCert(cert)}
        />
      )}

      {phase === "lookup" && (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Loader2 size={32} className="animate-spin text-muted-foreground" />
          <div className="text-sm text-muted-foreground tabular-nums">Looking up #{lookup.manualCert}…</div>
        </div>
      )}

      {phase === "manual_details" && (
        <FallbackForm
          error={result?.lookupError}
          onSubmit={lookup.lookupFallback}
          onCancel={lookup.reset}
        />
      )}

      {phase === "result" && result && (
        <div ref={resultRef}>
          <ResultCard
            result={result}
            lookup={lookup}
            selectedPct={selectedPct}
            onSelectPct={setSelectedPct}
            actionLoading={actionLoading}
            onAddToInventory={() => handleAddToInventory()}
            onRecordBuy={() => openBuyModal(false)}
            onScanNext={() => pushToBatchAndReset(result)}
            onPass={lookup.reset}
          />
        </div>
      )}

      <BatchList
        batch={batch}
        open={batchOpen}
        onToggle={() => setBatchOpen((o) => !o)}
        totalMarket={batchTotalMarket}
        totalOffer={batchTotalOffer}
        actionLoading={actionLoading}
        onRemove={(id) => setBatch((prev) => prev.filter((b) => b.id !== id))}
        onAddAll={() => batch.forEach((b) => handleAddToInventory(b))}
        onBulkBuy={() => openBuyModal(true)}
        onClear={() => setBatch([])}
      />

      <HistorySheet
        open={historyOpen}
        history={history}
        onClose={() => setHistoryOpen(false)}
        onClear={clearHistory}
        onSelect={(h) => {
          setCompany(h.company);
          setHistoryOpen(false);
          lookup.lookupCert(h.certNumber, h.company);
        }}
      />

      <BuyModal
        open={buyModalOpen}
        onClose={() => setBuyModalOpen(false)}
        bulk={bulkBuyMode}
        batchCount={batch.length}
        batchTotalMarket={batchTotalMarket}
        batchTotalOffer={batchTotalOffer}
        result={result}
        selectedPct={selectedPct}
        payment={buyPayment}
        onPaymentChange={setBuyPayment}
        owner={buyOwner}
        onOwnerChange={setBuyOwner}
        loading={actionLoading}
        onConfirm={handleConfirmBuy}
      />
    </div>
  );
}

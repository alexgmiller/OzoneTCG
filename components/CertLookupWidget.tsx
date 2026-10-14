"use client";

// ── CertLookupWidget ──
// Compact cert-number lookup — embeds inside any modal or form row.
// Collapsed: a "Scan cert" trigger. Open: cert input + optional barcode camera.
// Calls onResult() with card details once a cert is found.
//   controlledCompany — hides the internal company selector; this value is used.
//   embedded          — always-open, no trigger button (tab UIs).
//   inlineRow         — bare row (no bordered panel / header) for form rows;
//                       the close button calls onClose instead of collapsing.

import { useState, useRef, useEffect, useCallback } from "react";
import { ScanLine, Camera, X, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/ui";
import type { CertLookupResult, GradingCompany } from "@/app/api/cert-lookup/route";

export type CertWidgetResult = {
  name: string;
  grade: string;           // "10", "9.5"
  gradeLabel: string | null; // "GEM MT"
  company: GradingCompany;
  setName: string | null;
  cardNumber: string | null;
  market: number | null;
  certNumber: string;
};

interface Props {
  onResult: (r: CertWidgetResult) => void;
  defaultCompany?: GradingCompany;
  // When provided: hides internal company selector and uses this value.
  controlledCompany?: GradingCompany;
  label?: string;
  // Always-open mode for embedding in tab UIs (no trigger button).
  embedded?: boolean;
  // Start camera scanning immediately when embedded.
  defaultCameraOn?: boolean;
  // Inline-row mode: bare input row, no bordered panel; close calls onClose.
  inlineRow?: boolean;
  onClose?: () => void;
}

const COMPANIES: GradingCompany[] = ["PSA", "BGS", "CGC"];

const iconButtonClass =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground";

export default function CertLookupWidget({
  onResult,
  defaultCompany = "PSA",
  controlledCompany,
  label,
  embedded = false,
  defaultCameraOn = false,
  inlineRow = false,
  onClose,
}: Props) {
  const [open, setOpen] = useState(embedded || inlineRow ? true : false);
  const [internalCompany, setInternalCompany] = useState<GradingCompany>(defaultCompany);
  const [certInput, setCertInput] = useState("");
  const [cameraOn, setCameraOn] = useState(embedded && defaultCameraOn ? true : false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The active company: either controlled from outside or internal state
  const company: GradingCompany = controlledCompany ?? internalCompany;

  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const detectedRef = useRef(false);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  // Focus input when panel opens
  useEffect(() => {
    if (open && !cameraOn) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open, cameraOn]);

  // Stop camera when panel closes
  useEffect(() => {
    if (!open || !cameraOn) {
      controlsRef.current?.stop();
      controlsRef.current = null;
    }
  }, [open, cameraOn]);

  // Start camera scanning
  useEffect(() => {
    if (!cameraOn || !open) return;
    detectedRef.current = false;
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
          BarcodeFormat.UPC_A,
        ]);

        const reader = new BrowserMultiFormatReader(hints);
        if (!videoRef.current || !mounted) return;

        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result) => {
            if (!mounted || detectedRef.current) return;
            if (result) {
              const cleaned = result.getText().trim().replace(/\D/g, "");
              if (cleaned.length >= 7 && cleaned.length <= 12) {
                detectedRef.current = true;
                controls.stop();
                controlsRef.current = null;
                setCameraOn(false);
                setCertInput(cleaned);
                runLookup(cleaned, company);
              }
            }
          }
        );
        if (mounted) controlsRef.current = controls;
        else controls.stop();
      } catch {
        if (mounted) {
          setCameraOn(false);
          setError("Camera not available");
        }
      }
    })();

    return () => {
      mounted = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn, open]);

  const runLookup = useCallback(
    async (cert: string, co: GradingCompany) => {
      const cleaned = cert.trim().replace(/\D/g, "");
      if (cleaned.length < 5) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/cert-lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ certNumber: cleaned, company: co }),
        });
        const data: CertLookupResult = await res.json();

        if (data.lookupFailed) {
          setError(data.lookupError ?? "Cert lookup failed");
          setLoading(false);
          return;
        }

        onResult({
          name: data.name,
          grade: data.grade,
          gradeLabel: data.gradeLabel ?? null,
          company: data.company,
          setName: data.setName ?? null,
          cardNumber: data.cardNumber ?? null,
          market: data.market,
          certNumber: data.certNumber,
        });

        // Reset inputs
        setCertInput("");
        setError(null);
        if (inlineRow) {
          // Caller handles closing via onResult side-effect
        } else if (embedded) {
          if (defaultCameraOn) setTimeout(() => setCameraOn(true), 400);
        } else {
          setOpen(false);
        }
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    },
    [onResult, embedded, inlineRow, defaultCameraOn]
  );

  function handleSubmit() {
    runLookup(certInput, company);
  }

  function handleClose() {
    setCameraOn(false);
    setError(null);
    setCertInput("");
    if (onClose) {
      onClose();
    } else {
      setOpen(false);
    }
  }

  // ── Trigger button (collapsed state) ──

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border border-accent-primary-border px-3 text-sm font-medium text-accent-primary transition-colors duration-150 hover:bg-accent-primary-soft"
      >
        <ScanLine size={16} />
        {label ?? "Scan cert"}
      </button>
    );
  }

  // ── Shared inner content (used in both modes) ──

  const cameraStrip = cameraOn && (
    <div className="relative h-36 overflow-hidden rounded-lg bg-muted">
      <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative h-12 w-40">
          <div className="absolute left-0 top-0 h-5 w-5 border-l-2 border-t-2 border-accent-primary" />
          <div className="absolute right-0 top-0 h-5 w-5 border-r-2 border-t-2 border-accent-primary" />
          <div className="absolute bottom-0 left-0 h-5 w-5 border-b-2 border-l-2 border-accent-primary" />
          <div className="absolute bottom-0 right-0 h-5 w-5 border-b-2 border-r-2 border-accent-primary" />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
        <span className="rounded-full bg-card/80 px-2 py-0.5 text-xs text-muted-foreground">
          Point at barcode on slab label
        </span>
      </div>
    </div>
  );

  const inputRow = (
    <div className="flex gap-2">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={certInput}
        onChange={(e) => setCertInput(e.target.value.replace(/\D/g, ""))}
        onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
        placeholder="Cert number…"
        className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-sm tracking-wider text-foreground placeholder:text-muted-foreground disabled:opacity-50"
        disabled={loading}
      />
      <button
        type="button"
        onClick={() => setCameraOn((o) => !o)}
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors duration-150",
          cameraOn
            ? "border-accent-primary bg-accent-primary text-primary-foreground"
            : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
        title="Toggle camera"
        aria-label="Toggle camera"
        aria-pressed={cameraOn}
      >
        <Camera size={16} />
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading || certInput.length < 5}
        className="flex h-11 shrink-0 items-center gap-1 rounded-lg bg-accent-primary px-3 text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-accent-primary-hover disabled:opacity-40"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : "Look up"}
      </button>
      <button type="button" onClick={handleClose} className={iconButtonClass} aria-label="Close">
        <X size={16} />
      </button>
    </div>
  );

  const errorRow = error && (
    <div className="flex items-start gap-2 text-xs text-warning-strong dark:text-warning">
      <AlertCircle size={14} className="mt-0.5 shrink-0" />
      <span>{error}</span>
    </div>
  );

  // ── Inline-row mode (no panel border, no company selector) ──

  if (inlineRow) {
    return (
      <div className="space-y-2">
        {inputRow}
        {cameraStrip}
        {errorRow}
      </div>
    );
  }

  // ── Standard panel mode ──

  return (
    <div className="space-y-3 rounded-xl border border-accent-primary-border bg-card p-3">
      {/* Header row — company selector only shown when not controlled */}
      <div className="flex items-center justify-between gap-2">
        {!controlledCompany ? (
          <div className="flex gap-2" role="group" aria-label="Grading company">
            {COMPANIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setInternalCompany(c)}
                aria-pressed={internalCompany === c}
                className={cn(
                  "h-11 rounded-lg border px-3 text-xs font-semibold transition-colors duration-150",
                  internalCompany === c
                    ? "border-accent-primary-border bg-accent-primary-soft text-accent-primary"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        ) : (
          <SectionHeader>{controlledCompany} cert lookup</SectionHeader>
        )}
        {!embedded && (
          <button type="button" onClick={handleClose} className={iconButtonClass} aria-label="Close">
            <X size={16} />
          </button>
        )}
      </div>

      {cameraStrip}
      {inputRow}
      {errorRow}
    </div>
  );
}

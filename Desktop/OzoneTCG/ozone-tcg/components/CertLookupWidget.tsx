"use client";

/**
 * Compact cert-number lookup widget — embeds inside any modal.
 * Shows a "Scan cert" button. On tap: expands to cert input + optional camera.
 * Calls onResult() with card details once a cert is found.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { ScanLine, Camera, X, Loader2, AlertCircle } from "lucide-react";
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
  label?: string; // button label override
}

export default function CertLookupWidget({ onResult, defaultCompany = "PSA", label }: Props) {
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState<GradingCompany>(defaultCompany);
  const [certInput, setCertInput] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

        // Reset and close
        setCertInput("");
        setError(null);
        setOpen(false);
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    },
    [onResult]
  );

  function handleSubmit() {
    runLookup(certInput, company);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-violet-500/30 text-violet-500 hover:bg-violet-500/10 transition-colors font-medium"
      >
        <ScanLine size={13} />
        {label ?? "Scan cert"}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3 space-y-2.5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 p-0.5 rounded-lg bg-black/10 dark:bg-white/10">
          {(["PSA", "BGS", "CGC"] as GradingCompany[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCompany(c)}
              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md transition-all ${
                company === c
                  ? "bg-white dark:bg-white/20 shadow-sm"
                  : "opacity-40 hover:opacity-70"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => { setOpen(false); setCameraOn(false); setError(null); }}
          className="p-1 rounded-lg opacity-40 hover:opacity-100 transition-opacity"
        >
          <X size={13} />
        </button>
      </div>

      {/* Camera strip */}
      {cameraOn && (
        <div className="relative rounded-lg overflow-hidden bg-black" style={{ height: 140 }}>
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
          {/* targeting box */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-40 h-12">
              <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-white/80" />
              <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-white/80" />
              <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-white/80" />
              <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-white/80" />
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 text-center text-[10px] text-white/60 pb-1">
            Point at barcode on slab label
          </div>
        </div>
      )}

      {/* Input row */}
      <div className="flex gap-1.5">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={certInput}
          onChange={(e) => setCertInput(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          placeholder="Cert number…"
          className="flex-1 bg-background border rounded-lg px-3 py-1.5 text-sm font-mono tracking-wider focus:outline-none focus:ring-1 focus:ring-violet-500"
          disabled={loading}
        />
        <button
          type="button"
          onClick={() => setCameraOn((o) => !o)}
          className={`px-2.5 py-1.5 rounded-lg border transition-colors ${
            cameraOn
              ? "bg-violet-600 border-violet-500 text-white"
              : "border-border opacity-50 hover:opacity-100"
          }`}
          title="Toggle camera"
        >
          <Camera size={14} />
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || certInput.length < 5}
          className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white text-xs font-semibold transition-colors flex items-center gap-1"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : "Look up"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-1.5 text-xs text-amber-500">
          <AlertCircle size={12} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

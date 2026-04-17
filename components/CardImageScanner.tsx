"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Camera, X, RefreshCw } from "lucide-react";
import { ocrReadCard } from "@/lib/ocrCardReader";
import { matchOcrResult } from "@/lib/cardMatchFromScan.client";

export type CardImageScanResult = {
  name: string;
  set_name: string;
  card_number: string;
  variant: string;
  language: string;
  confidence: number;
  // Matched card data from DB (absent if no match)
  matchedName?: string;
  matchedSetName?: string;
  matchedCardNumber?: string;
  matchedImageUrl?: string | null;
  matchedMarket?: number | null;
  matchedCardId?: string;
  // Which path produced the result
  scanSource?: "ocr" | "cloud";
};

type ScanPhase =
  | "idle"
  | "ocr"       // running on-device Tesseract OCR
  | "matching"  // querying search-cards API with OCR fields
  | "cloud"     // falling back to Claude vision API
  | "done";

type Props = {
  onResult: (result: CardImageScanResult) => void;
  onClose: () => void;
};

const PHASE_LABEL: Record<ScanPhase, string> = {
  idle: "",
  ocr: "Scanning locally…",
  matching: "Scanning locally…",
  cloud: "Checking cloud…",
  done: "",
};

export default function CardImageScanner({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanPhase, setScanPhase] = useState<ScanPhase>("idle");
  const [scanError, setScanError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => { setIsMounted(true); }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // ── Start camera ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setCameraReady(true);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("Permission") || msg.includes("NotAllowed")) {
          setCameraError("Camera access denied. Please allow camera access and try again.");
        } else if (msg.includes("NotFound") || msg.includes("DevicesNotFound")) {
          setCameraError("No camera found on this device.");
        } else {
          setCameraError("Could not start camera. Please try again.");
        }
      }
    }

    startCamera();
    return () => { cancelled = true; stopCamera(); };
  }, [stopCamera]);

  function handleClose() { stopCamera(); onClose(); }

  // ── Capture + two-step pipeline ─────────────────────────────────────────────
  async function handleCapture() {
    if (!videoRef.current || !canvasRef.current) return;
    setScanError(null);

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Capture frame — cap at 1024 px, stay under ~200 KB
    const maxDim = 1024;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    let quality = 0.85;
    let dataUrl = canvas.toDataURL("image/jpeg", quality);
    while (dataUrl.length > 270_000 && quality > 0.4) {
      quality -= 0.1;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }
    const base64 = dataUrl.split(",")[1];
    setPreview(dataUrl);

    // ── Step 1: on-device OCR ──────────────────────────────────────────────────
    setScanPhase("ocr");
    let ocrResult;
    try {
      ocrResult = await ocrReadCard(base64);
    } catch {
      // OCR failed entirely — skip straight to cloud
      ocrResult = { name: "", cardNumber: "", setText: "", confidence: 0 };
    }

    // ── Step 2: DB match via search-cards ──────────────────────────────────────
    setScanPhase("matching");
    let matchConf: "high" | "medium" | "low" = "low";
    let bestMatch = null;

    if (ocrResult.name) {
      try {
        const matchResult = await matchOcrResult(ocrResult);
        matchConf = matchResult.confidence;
        bestMatch = matchResult.bestMatch;
      } catch {
        matchConf = "low";
      }
    }

    // ── Decision: return OCR result or fall back to cloud ─────────────────────
    if ((matchConf === "high" || matchConf === "medium") && bestMatch) {
      stopCamera();
      setScanPhase("done");
      onResult({
        name: ocrResult.name,
        set_name: ocrResult.setText,
        card_number: ocrResult.cardNumber,
        variant: "",
        language: "en",
        confidence: matchConf === "high" ? 90 : 60,
        ...bestMatch,
        scanSource: "ocr",
      });
      return;
    }

    // ── Step 3: Cloud fallback (Claude vision API) ─────────────────────────────
    setScanPhase("cloud");
    try {
      const res = await fetch("/api/scan-card-image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: base64 }),
      });
      const json = await res.json();
      if (!res.ok) {
        setScanError(json.error ?? "Scan failed — please try again");
        setScanPhase("idle");
        return;
      }
      stopCamera();
      setScanPhase("done");
      onResult({ ...(json as CardImageScanResult), scanSource: "cloud" });
    } catch {
      setScanError("Network error — please try again");
      setScanPhase("idle");
    }
  }

  function handleRetry() {
    setPreview(null);
    setScanError(null);
    setScanPhase("idle");
  }

  const isScanning = scanPhase !== "idle" && scanPhase !== "done";
  const phaseLabel = PHASE_LABEL[scanPhase];

  if (!isMounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 shrink-0">
        <div className="flex items-center gap-2 text-white">
          <Camera size={18} />
          <span className="text-sm font-semibold">Scan Card</span>
        </div>
        <button onClick={handleClose} className="text-white/70 hover:text-white transition-colors p-1">
          <X size={20} />
        </button>
      </div>

      {/* Camera / preview area */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        {/* Live video — hidden once frame is captured */}
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover ${preview ? "opacity-0" : "opacity-100"}`}
          playsInline
          muted
        />

        {/* Captured frame preview */}
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Captured" className="absolute inset-0 w-full h-full object-cover" />
        )}

        {/* Card-shaped aiming overlay — visible while live camera is active */}
        {!preview && cameraReady && (
          <div
            className="absolute pointer-events-none"
            style={{
              width: "min(65vw, 45vh)",
              height: "calc(min(65vw, 45vh) * 1.4)",
              border: "2px solid rgba(255,255,255,0.8)",
              borderRadius: "8px",
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
            }}
          />
        )}

        {/* Scanning overlay with animated spinner + phase label */}
        {isScanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            <span className="text-white text-sm font-medium">{phaseLabel}</span>
            {/* Show phase indicator dots */}
            <div className="flex gap-1.5">
              {(["ocr", "matching", "cloud"] as const).map((p) => (
                <div
                  key={p}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    scanPhase === p
                      ? "bg-white"
                      : scanPhase === "cloud" && p !== "cloud"
                      ? "bg-white/40"
                      : "bg-white/15"
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Camera error */}
        {cameraError && !preview && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="bg-white/10 rounded-xl p-4 text-center max-w-xs">
              <p className="text-white text-sm">{cameraError}</p>
            </div>
          </div>
        )}
      </div>

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Bottom controls */}
      <div className="shrink-0 bg-black/80 px-6 py-5 flex flex-col items-center gap-3">
        {scanError && (
          <div className="text-red-400 text-xs text-center">{scanError}</div>
        )}

        {!preview && !isScanning && (
          <>
            <button
              onClick={handleCapture}
              disabled={!cameraReady}
              className="w-16 h-16 rounded-full bg-white disabled:opacity-30 transition-opacity flex items-center justify-center"
            >
              <div className="w-12 h-12 rounded-full border-2 border-black" />
            </button>
            <p className="text-white/40 text-xs">Center card in frame, then tap to capture</p>
          </>
        )}

        {preview && !isScanning && (
          <button
            onClick={handleRetry}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors"
          >
            <RefreshCw size={14} />
            Retake
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}

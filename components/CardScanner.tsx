"use client";

import { useRef, useState } from "react";

type Condition = "Near Mint" | "Lightly Played" | "Moderately Played" | "Heavily Played" | "Damaged";

export type ScanResult = {
  name: string;
  setName: string;
  cardNumber: string;
  imageUrl: string | null;
  market: number | null;
  condition: Condition;
};

/** Draws the image onto a canvas and exports as JPEG — handles HEIC and other formats */
function toJpegBase64(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // Cap at 1024px on the longest side to keep payload size reasonable
      const maxDim = 1024;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const jpeg = canvas.toDataURL("image/jpeg", 0.85);
      resolve(jpeg.split(",")[1]);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

const CONDITIONS: Condition[] = [
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
];

type Props = {
  open: boolean;
  onClose: () => void;
  onResult: (data: ScanResult) => void;
};

export default function CardScanner({ open, onClose, onResult }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<Omit<ScanResult, "condition"> | null>(null);
  const [condition, setCondition] = useState<Condition>("Near Mint");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function reset() {
    setPreview(null);
    setScanning(false);
    setResult(null);
    setCondition("Near Mint");
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // HEIC files can't be converted in Chrome/Firefox — ask user to convert first
    if (file.type === "image/heic" || file.type === "image/heif" || file.name.toLowerCase().endsWith(".heic") || file.name.toLowerCase().endsWith(".heif")) {
      setError("HEIC photos aren't supported in this browser. On your Mac, open the photo in Preview → File → Export → format JPEG, then upload the JPEG.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      setPreview(dataUrl);
      setError(null);
      setResult(null);
      setScanning(true);

      try {
        // Try to convert to JPEG via canvas; fall back to raw data if it fails
        let imageBase64: string;
        let mimeType: string;
        try {
          imageBase64 = await toJpegBase64(dataUrl);
          mimeType = "image/jpeg";
        } catch {
          const [meta, raw] = dataUrl.split(",");
          imageBase64 = raw;
          mimeType = meta.match(/:(.*?);/)?.[1] ?? "image/jpeg";
        }

        const res = await fetch("/api/scan-card", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ imageBase64, mimeType }),
        });

        const json = await res.json();

        if (!res.ok) {
          setError(json.error ?? "Scan failed");
        } else {
          setResult(json);
        }
      } catch {
        setError("Failed to send image — please try again");
      } finally {
        setScanning(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleUse() {
    if (!result) return;
    onResult({ ...result, condition });
    handleClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background border rounded-xl shadow-xl w-full max-w-sm flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-base">Scan Card</h2>
          <button onClick={handleClose} className="text-sm text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>

        {!preview && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-muted-foreground/30 rounded-lg py-10 text-sm text-muted-foreground hover:border-foreground/50 hover:text-foreground transition-colors flex flex-col items-center gap-2"
            >
              <span className="text-3xl">📷</span>
              <span>Take photo or upload image</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFile}
            />
          </div>
        )}

        {preview && (
          <div className="relative">
            <img src={preview} alt="Card preview" className="w-full rounded-lg object-contain max-h-48" />
            {scanning && (
              <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-medium animate-pulse">Identifying card…</span>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-3 items-start">
              {result.imageUrl && (
                <img src={result.imageUrl} alt={result.name} className="w-16 rounded shadow-sm flex-shrink-0" />
              )}
              <div className="flex flex-col gap-1 text-sm min-w-0">
                <p className="font-medium truncate">{result.name}</p>
                {result.setName && <p className="text-muted-foreground truncate">{result.setName}</p>}
                {result.cardNumber && <p className="text-muted-foreground">#{result.cardNumber}</p>}
                {result.market != null && (
                  <p className="font-medium text-green-700">${result.market.toFixed(2)}</p>
                )}
              </div>
            </div>

            <select
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              value={condition}
              onChange={(e) => setCondition(e.target.value as Condition)}
            >
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <div className="flex gap-2">
              <button
                onClick={() => { reset(); fileRef.current?.click(); }}
                className="flex-1 border rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                Rescan
              </button>
              <button
                onClick={handleUse}
                className="flex-1 bg-foreground text-background rounded-lg px-3 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Use Card
              </button>
            </div>
          </div>
        )}

        {error && preview && (
          <button
            onClick={() => { reset(); fileRef.current?.click(); }}
            className="w-full border rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors"
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImageUp, RotateCcw } from "lucide-react";
import { MoneyDisplay, Skeleton } from "@/components/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ScanMatch } from "@/lib/cardScan";
import type { CatalogCard } from "@/app/protected/search/catalog";
import type { ScanResponse } from "@/app/api/scan-card/route";

// ── CardScanner ──
// Point the camera at a raw card or a slab and tap the shutter (or upload a
// photo): the frame goes to /api/scan-card, which asks PokeInvest who it is
// and finds the card in our catalog. Up to three matches come back to tap;
// `onPick` gets the chosen one and the scanner is ready for the next card.
//
// The photo sent is what the viewfinder shows (its 3:4 centre), at most
// 1024px on the long side, as a JPEG: small to upload on show-floor signal.

export type CardScanMatch = ScanMatch<CatalogCard>;

const MAX_SIDE = 1024;
const ASPECT = 3 / 4; // viewfinder width : height

// The centre of a frame at the viewfinder's shape, scaled down, as a JPEG
async function toJpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob | null> {
  let sw = width, sh = height;
  if (sw / sh > ASPECT) sw = sh * ASPECT; else sh = sw / ASPECT;
  const sx = (width - sw) / 2, sy = (height - sh) / 2;
  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext("2d")?.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
}

type Phase =
  | { kind: "ready" }
  | { kind: "working"; preview: string }
  | { kind: "results"; preview: string; matches: CardScanMatch[] }
  | { kind: "message"; preview: string | null; title: string; hint: string };

const MESSAGES: Record<Exclude<ScanResponse["status"], "ok">, { title: string; hint: string }> = {
  none: { title: "No match", hint: "Fill the frame with the whole card and tilt it away from glare, then try again." },
  limit: { title: "Today's scans are used up", hint: "PokeInvest's free scans and today's share of your key are gone. Search by name for now; scanning is back tomorrow." },
  offline: { title: "The scanner is offline", hint: "PokeInvest's scanner didn't answer. Try again in a minute, or search by name." },
  error: { title: "That scan didn't go through", hint: "Check your connection and try again." },
};

export function CardScanner({ onPick, pickLabel = "Choose" }: {
  onPick: (match: CardScanMatch) => void;
  /** The match buttons' word: "Add" in the POS, "Open" on the Scan page */
  pickLabel?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "ready" });
  const [camera, setCamera] = useState<"starting" | "on" | "off">("starting");
  const previewUrl = useRef<string | null>(null);

  // The camera runs while the viewfinder shows
  const live = phase.kind === "ready";
  useEffect(() => {
    if (!live) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCamera("on");
      } catch {
        if (!cancelled) setCamera("off");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [live]);

  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);

  const send = useCallback(async (photo: Blob) => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    const preview = URL.createObjectURL(photo);
    previewUrl.current = preview;
    setPhase({ kind: "working", preview });
    try {
      const form = new FormData();
      form.append("image", photo, "card.jpg");
      const res = await fetch("/api/scan-card", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({ status: "error" }))) as ScanResponse;
      if (body.status === "ok") setPhase({ kind: "results", preview, matches: body.matches });
      else setPhase({ kind: "message", preview, ...MESSAGES[body.status] });
    } catch {
      setPhase({ kind: "message", preview, ...MESSAGES.error });
    }
  }, []);

  async function shoot() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    try { navigator.vibrate?.(10); } catch { /* not supported */ }
    const photo = await toJpeg(v, v.videoWidth, v.videoHeight);
    if (photo) await send(photo);
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const photo = await toJpeg(bitmap, bitmap.width, bitmap.height);
      bitmap.close();
      if (photo) await send(photo);
    } catch {
      setPhase({ kind: "message", preview: null, title: "Couldn't open that photo", hint: "Try another photo, or use the camera." });
    }
  }

  function pick(m: CardScanMatch) {
    onPick(m);
    setPhase({ kind: "ready" });
  }

  const again = () => setPhase({ kind: "ready" });

  return (
    <div className="space-y-3">
      {/* ── Viewfinder, or the photo that was sent (small, so the matches fit on a phone) ── */}
      <div className={cn(
        "relative mx-auto aspect-[3/4] overflow-hidden rounded-2xl bg-surface-2",
        phase.kind === "ready" ? "w-full max-w-sm" : "w-32",
      )}>
        {phase.kind === "ready" ? (
          <>
            <video ref={videoRef} playsInline muted autoPlay aria-label="Camera"
              className={cn("h-full w-full object-cover", camera !== "on" && "invisible")} />
            {camera === "on" && (
              // A card-shaped guide; anything in the viewfinder is sent
              <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="aspect-[63/88] h-4/5 rounded-xl border-2 border-accent" />
              </div>
            )}
            {camera !== "on" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
                {camera === "starting" ? (
                  <Skeleton className="h-full w-full rounded-none" />
                ) : (
                  <>
                    <Camera size={28} className="text-muted-foreground" aria-hidden />
                    <p className="text-sm text-muted-foreground">No camera here. Upload a photo of the card instead.</p>
                  </>
                )}
              </div>
            )}
          </>
        ) : phase.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={phase.preview} alt="The photo sent" className="h-full w-full object-cover" />
        ) : null}
        {phase.kind === "working" && (
          <div className="absolute inset-x-0 bottom-0 bg-surface px-4 py-3 text-center text-sm font-medium text-foreground" role="status">
            Finding the card…
          </div>
        )}
      </div>

      {/* ── Shutter and upload ── */}
      {phase.kind === "ready" && (
        <div className="flex items-center justify-center gap-4">
          <button type="button" onClick={() => fileRef.current?.click()}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}>
            <ImageUp size={16} aria-hidden /> Upload
          </button>
          <button type="button" onClick={shoot} disabled={camera !== "on"} aria-label="Scan this card"
            className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-bg transition duration-150 ease-out disabled:opacity-40 motion-safe:enabled:active:scale-press">
            <Camera size={26} aria-hidden />
          </button>
          {/* Balances the Upload button so the shutter stays centred */}
          <span className="w-24" aria-hidden />
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      )}

      {/* ── Matches ── */}
      {phase.kind === "results" && (
        <div className="space-y-2">
          <ul className="overflow-hidden rounded-2xl bg-surface-2" aria-label="Matches">
            {phase.matches.map((m, i) => (
              <li key={m.pokeinvestId} className="flex items-center gap-3 border-b border-border p-3 last:border-b-0">
                {(m.card?.imageUrl ?? m.image) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={(m.card?.imageUrl ?? m.image)!} alt="" className="aspect-[63/88] w-12 shrink-0 rounded-md bg-surface object-contain" />
                ) : (
                  <div className="aspect-[63/88] w-12 shrink-0 rounded-md bg-surface" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {m.name}{m.number ? <span className="font-mono text-xs text-muted-foreground"> #{m.number}</span> : null}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {i === 0 ? "Best match · " : ""}{m.card?.setName ?? m.set}{!m.card ? " · not in our catalog" : ""}
                  </div>
                  {(m.raw != null || m.psa10 != null) && (
                    <div className="flex gap-3 pt-0.5 text-xs text-muted-foreground">
                      {m.raw != null && <span>Raw <MoneyDisplay amount={m.raw} tone="neutral" className="text-foreground" /></span>}
                      {m.psa10 != null && <span>PSA 10 <MoneyDisplay amount={m.psa10} tone="neutral" className="text-foreground" /></span>}
                    </div>
                  )}
                </div>
                <Button size="sm" variant={i === 0 ? "default" : "outline"} onClick={() => pick(m)}>{pickLabel}</Button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between">
            {/* PokeInvest's credit, required wherever its prices show */}
            <a href={phase.matches[0]?.pageUrl ?? "https://www.pokeinvest.io"} target="_blank" rel="noopener noreferrer"
              className="inline-flex h-11 items-center text-xs text-muted-foreground hover:text-foreground">
              Scans and prices by PokeInvest
            </a>
            <Button size="sm" variant="ghost" onClick={again} className="gap-1.5"><RotateCcw size={14} aria-hidden /> Scan again</Button>
          </div>
        </div>
      )}

      {/* ── No result ── */}
      {phase.kind === "message" && (
        <div className="space-y-3 rounded-2xl bg-surface-2 p-4 text-center">
          <div className="text-sm font-semibold text-foreground">{phase.title}</div>
          <p className="text-sm text-muted-foreground">{phase.hint}</p>
          <Button size="sm" onClick={again} className="gap-1.5"><RotateCcw size={14} aria-hidden /> Scan again</Button>
        </div>
      )}
    </div>
  );
}

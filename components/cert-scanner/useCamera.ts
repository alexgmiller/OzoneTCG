"use client";

import { useEffect, useRef, useState } from "react";

// ── useCamera ──
// Drives html5-qrcode against the #cert-scanner-container element while
// `active` is true. Calls onDetected with the cleaned digits once per start.

export const CAMERA_CONTAINER_ID = "cert-scanner-container";

export function useCamera({
  active,
  onDetected,
}: {
  active: boolean;
  onDetected: (cert: string) => void;
}) {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    if (!active) return;

    let mounted = true;
    let started = false;
    let detected = false;
    let instance: { stop: () => Promise<void> } | null = null;
    setCameraError(null);

    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (!mounted) return;

        const scanner = new Html5Qrcode(CAMERA_CONTAINER_ID, {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.CODABAR,
          ],
        });
        instance = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 15 },
          (decodedText) => {
            if (!mounted || detected) return;
            const cleaned = decodedText.replace(/\D/g, "");
            if (cleaned.length < 7 || cleaned.length > 12) return;
            detected = true;
            try { navigator.vibrate?.(50); } catch {}
            if (started) {
              started = false;
              scanner.stop().catch(() => {});
            }
            onDetectedRef.current(cleaned);
          },
          () => { /* per-frame no-barcode error — ignore */ }
        );

        if (!mounted) {
          // Cleanup ran while start() was in flight — stop now that it's running.
          try { await scanner.stop(); } catch {}
          return;
        }
        started = true;
      } catch (err) {
        if (!mounted) return;
        console.warn("[CertScanner] Camera start error:", err);
        setCameraError(
          err instanceof Error && (err.message.includes("Permission") || err.message.includes("NotAllowed"))
            ? "Camera access denied"
            : "Camera unavailable"
        );
      }
    })();

    return () => {
      mounted = false;
      // Only stop if start() already resolved — otherwise the in-flight
      // completion handler above stops it once it resolves.
      if (instance && started) {
        started = false;
        instance.stop().catch(() => {});
      }
      instance = null;
    };
  }, [active]);

  return { cameraError };
}

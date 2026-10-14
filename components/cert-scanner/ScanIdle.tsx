"use client";

import { useEffect, useState } from "react";
import { ScanLine } from "lucide-react";
import { CAMERA_CONTAINER_ID, useCamera } from "./useCamera";
import { CAMERA_PREF_KEY, btnOutline, btnPrimary, inputClass } from "./shared";

// ── ScanIdle ──
// Viewfinder + manual cert entry. Camera defaults ON on phones, OFF on desktop,
// and the user's last choice is remembered on this device.

export function ScanIdle({
  manualCert,
  onManualCertChange,
  onSubmit,
  onDetected,
}: {
  manualCert: string;
  onManualCertChange: (v: string) => void;
  onSubmit: () => void;
  onDetected: (cert: string) => void;
}) {
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const { cameraError } = useCamera({ active: cameraEnabled, onDetected });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CAMERA_PREF_KEY);
      setCameraEnabled(stored !== null ? stored === "true" : window.innerWidth < 768);
    } catch {}
  }, []);

  function toggleCamera() {
    const next = !cameraEnabled;
    setCameraEnabled(next);
    try { localStorage.setItem(CAMERA_PREF_KEY, String(next)); } catch {}
  }

  return (
    <div className="space-y-3">
      {/* Viewfinder — container stays in the DOM so html5-qrcode can find it by id */}
      <div className={cameraEnabled ? "relative aspect-video overflow-hidden rounded-xl bg-muted" : "hidden"}>
        <div
          id={CAMERA_CONTAINER_ID}
          className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
        />
        {/* Target rectangle — wide for 1D barcodes */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-14 w-64 rounded-lg border-2 border-accent-primary" />
        </div>
        {cameraError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
            <div className="px-5 text-center text-sm text-muted-foreground">{cameraError}</div>
          </div>
        )}
      </div>

      {/* Manual input */}
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={manualCert}
          onChange={(e) => onManualCertChange(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
          placeholder="Cert number"
          className={`${inputClass} flex-1 font-mono tracking-wider`}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={manualCert.length < 5}
          className={`${btnPrimary} h-11 shrink-0`}
        >
          Look up
        </button>
      </div>

      <button type="button" onClick={toggleCamera} className={`${btnOutline} w-full`}>
        <ScanLine size={16} />
        {cameraEnabled ? "Stop camera" : "Scan with camera"}
      </button>
    </div>
  );
}

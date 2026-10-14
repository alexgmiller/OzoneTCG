"use client";

import { useEffect, useState } from "react";
import { HardDrive } from "lucide-react";
import { Skeleton, useToast } from "@/components/ui";
import { Section, SettingRow, ActionButton } from "./SettingsPrimitives";

const IMAGE_CACHE_NAME = "ozone-card-images-v1";

// ── Storage ──
export function StorageSection() {
  const toast = useToast();
  const [supported, setSupported] = useState(true);
  const [cacheSize, setCacheSize] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!("caches" in window)) { setSupported(false); return; }
    let mounted = true;
    caches.open(IMAGE_CACHE_NAME)
      .then((c) => c.keys())
      .then((keys) => { if (mounted) setCacheSize(keys.length); })
      .catch(() => { if (mounted) setCacheSize(0); });
    return () => { mounted = false; };
  }, []);

  async function handleClear() {
    setClearing(true);
    try {
      // Tell the service worker too so its bookkeeping stays in sync.
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "clear-image-cache" });
      }
      await caches.delete(IMAGE_CACHE_NAME);
      setCacheSize(0);
      toast.success("Image cache cleared");
    } catch {
      toast.error("Couldn't clear the image cache");
    } finally {
      setClearing(false);
    }
  }

  if (!supported) return null;

  return (
    <Section icon={HardDrive} title="Storage">
      <SettingRow
        label="Cached card images"
        description="Stored on this device so cards load instantly at shows with poor service"
      >
        {cacheSize === null ? (
          <Skeleton className="h-4 w-8" />
        ) : (
          <span className="text-sm font-medium tabular-nums text-foreground">
            {cacheSize.toLocaleString()}
          </span>
        )}
      </SettingRow>
      <SettingRow label="Clear image cache" description="Images re-download the next time they're viewed">
        <ActionButton onClick={handleClear} disabled={clearing || !cacheSize}>
          {clearing ? "Clearing…" : "Clear"}
        </ActionButton>
      </SettingRow>
    </Section>
  );
}

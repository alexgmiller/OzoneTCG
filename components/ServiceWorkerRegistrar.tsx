"use client";

import { useEffect } from "react";

// Registers the service worker once on mount.
// Only active in production or when NEXT_PUBLIC_SW_ENABLED=true so dev builds
// are never affected by stale cached bundles.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    const enabled =
      process.env.NODE_ENV === "production" ||
      process.env.NEXT_PUBLIC_SW_ENABLED === "true";
    if (!enabled) return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => { console.debug("[sw] registered", reg.scope); })
      .catch((err) => { console.debug("[sw] registration failed", err); });
  }, []);

  return null;
}

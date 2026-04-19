"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    ) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => {/* silent — SW is a progressive enhancement */});
  }, []);

  return null;
}

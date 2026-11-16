"use client";

import { useCallback, useEffect, useState } from "react";

// ── useViewMode ──
// Grid | List for Inventory. Persisted per browser in localStorage (wrapped in
// try/catch: private windows and cleared site data can throw or come back
// empty). With nothing stored, phones default to grid and desktops to list.
export type ViewMode = "grid" | "list";

const KEY = "ozone.inventory.view";

function read(): ViewMode | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "grid" || v === "list" ? v : null;
  } catch {
    return null;
  }
}

function write(v: ViewMode) {
  try { localStorage.setItem(KEY, v); } catch { /* best effort */ }
}

export function useViewMode(): [ViewMode, (v: ViewMode) => void, boolean] {
  const [view, setView] = useState<ViewMode>("grid");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = read();
    setView(stored ?? (window.matchMedia("(min-width: 768px)").matches ? "list" : "grid"));
    setReady(true);
  }, []);

  const set = useCallback((v: ViewMode) => { setView(v); write(v); }, []);
  return [view, set, ready];
}

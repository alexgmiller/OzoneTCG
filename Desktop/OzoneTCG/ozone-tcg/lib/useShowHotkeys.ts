"use client";

import { useEffect } from "react";

type Tab = "scan" | "buy" | "sell" | "deal" | "trade";

const TAB_KEYS: Record<string, Tab> = {
  "1": "scan",
  "2": "buy",
  "3": "sell",
  "4": "deal",
  "5": "trade",
};

/**
 * Global keyboard shortcuts for show mode.
 * - 1–5: switch tabs (only when no input is focused)
 * - Esc: calls onEscape (close top modal, cancel operation)
 */
export function useShowHotkeys({
  enabled,
  onTabChange,
  onEscape,
}: {
  enabled: boolean;
  onTabChange: (tab: Tab) => void;
  onEscape: () => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    function handle(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target as HTMLElement;
      const isEditable =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      if (e.key === "Escape") {
        onEscape();
        return;
      }

      if (!isEditable && TAB_KEYS[e.key]) {
        e.preventDefault();
        onTabChange(TAB_KEYS[e.key]);
      }
    }

    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [enabled, onTabChange, onEscape]);
}

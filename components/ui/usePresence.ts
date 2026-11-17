"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// ── usePresence ──
// Keeps an overlay (Sheet, Modal, ContextMenu) mounted long enough to animate
// out. While `open`, `present` is true and `view` is what was passed in. Once
// it closes, `closing` is true for `exitMs`, then `present` turns false.
//
// `view` holds whatever the overlay renders from props (children, title…).
// While closing it returns the last open value: the parent has usually
// cleared its data by then (`open={!!card}` with `{card && …}` inside), and
// the panel would otherwise empty out as it slides away.
export const EXIT_MS = 150;

export function usePresence<T>(open: boolean, view: T, exitMs = EXIT_MS) {
  const [mounted, setMounted] = useState(open);
  const last = useRef(view);

  useLayoutEffect(() => {
    if (open) last.current = view;
  });

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const id = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(id);
  }, [open, exitMs]);

  return {
    present: open || mounted,
    closing: !open,
    view: open ? view : last.current,
  };
}

// Enter/exit classes (tailwindcss-animate). Enter eases out, exit eases in,
// nothing over 200ms (design-system §5). Reduced-motion users get no animation.
export const SCRIM_MOTION = {
  enter: "animate-in fade-in-0 duration-200 ease-out motion-reduce:animate-none",
  exit: "animate-out fade-out-0 duration-150 ease-in fill-mode-forwards motion-reduce:animate-none",
};
export const POP_MOTION = {
  enter: "animate-in fade-in-0 zoom-in-95 duration-150 ease-out motion-reduce:animate-none",
  exit: "animate-out fade-out-0 zoom-out-95 duration-150 ease-in fill-mode-forwards motion-reduce:animate-none",
};

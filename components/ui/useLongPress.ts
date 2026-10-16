"use client";

import { useCallback, useRef } from "react";

// ── useLongPress ──
// Long-press (450ms) or right-click opens a context menu near the pointer.
// A scroll — pointer travel over the slop — cancels the press. Haptic tap
// on open where supported.
export type PressPoint = { x: number; y: number };

const HOLD_MS = 450;
const SLOP_PX = 10;

export function useLongPress(onLongPress: (p: PressPoint) => void, enabled = true) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<PressPoint | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  }, []);

  const fire = useCallback((p: PressPoint) => {
    fired.current = true;
    try { navigator.vibrate?.(10); } catch { /* unsupported */ }
    onLongPress(p);
  }, [onLongPress]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!enabled || e.button !== 0) return;
    fired.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    timer.current = setTimeout(() => {
      if (start.current) fire(start.current);
      clear();
    }, HOLD_MS);
  }, [enabled, fire, clear]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!start.current) return;
    if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > SLOP_PX) clear();
  }, [clear]);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (!enabled) return;
    e.preventDefault();
    clear();
    fire({ x: e.clientX, y: e.clientY });
  }, [enabled, fire, clear]);

  // Swallow the click that follows a fired long-press so the tile doesn't also open
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (fired.current) {
      e.preventDefault();
      e.stopPropagation();
      fired.current = false;
    }
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu,
    onClickCapture,
  };
}

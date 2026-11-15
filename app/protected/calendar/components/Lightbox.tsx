"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui";

// ── Full-size image overlay ───────────────────────────────────────────────────

export function Lightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  if (!url) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label="Close"
        className="absolute right-4 top-4 text-neutral hover:bg-transparent hover:text-accent-secondary"
        onClick={onClose}
      >
        <X size={22} />
      </Button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Full size"
        className="max-h-full max-w-full rounded-xl object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

"use client";

import { RefreshCw } from "lucide-react";
import { Modal } from "@/components/ui";
import { MoneyOrDash, shortDate, type HistoryEntry } from "./shared";

// ── HistorySheet ──
// Recent scans on this device. Tapping a row re-runs that lookup.

export function HistorySheet({
  open,
  history,
  onClose,
  onClear,
  onSelect,
}: {
  open: boolean;
  history: HistoryEntry[];
  onClose: () => void;
  onClear: () => void;
  onSelect: (h: HistoryEntry) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Recent scans">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={onClear}
          className="h-11 px-3 text-sm text-muted-foreground transition-colors duration-150 hover:text-negative"
        >
          Clear history
        </button>
      </div>
      <div className="max-h-96 divide-y divide-border overflow-y-auto rounded-xl border border-border">
        {history.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => onSelect(h)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-muted"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{h.name}</div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {h.company} {h.grade} · #{h.certNumber}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-semibold"><MoneyOrDash amount={h.market} /></div>
              <div className="text-xs text-muted-foreground tabular-nums">{shortDate(h.scannedAt)}</div>
            </div>
            <RefreshCw size={14} className="shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </Modal>
  );
}

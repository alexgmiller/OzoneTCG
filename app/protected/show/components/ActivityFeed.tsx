"use client";

import React from "react";
import { ChevronDown, Clock } from "lucide-react";
import type { FeedEntry } from "../types";
import { money, fmtTime } from "../utils";

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  feed: FeedEntry[];
  expandedBatches: Set<string>;
  setExpandedBatches: React.Dispatch<React.SetStateAction<Set<string>>>;
  busy: boolean;
  handleUndo: (scanId: string) => void;
  setLightboxUrl: React.Dispatch<React.SetStateAction<string | null>>;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ActivityFeed({
  feed,
  expandedBatches,
  setExpandedBatches,
  busy,
  handleUndo,
  setLightboxUrl,
}: Props) {
  return (
    <div className="px-4 pt-4 pb-24 md:pb-20">
      <div className="text-xs font-semibold uppercase tracking-wide opacity-30 mb-2">Activity</div>
      {feed.length === 0 ? (
        <div className="text-sm opacity-30 text-center py-6">No activity yet</div>
      ) : (
        <div className="space-y-0">
          {(() => {
            // Group consecutive entries that share a batch_id
            type FeedGroup = { isBatch: true; batchId: string; entries: FeedEntry[] } | { isBatch: false; entry: FeedEntry };
            const groups: FeedGroup[] = [];
            const batchMap = new Map<string, FeedEntry[]>();
            for (const entry of feed) {
              if (entry.batchId) {
                if (!batchMap.has(entry.batchId)) {
                  const arr: FeedEntry[] = [];
                  batchMap.set(entry.batchId, arr);
                  groups.push({ isBatch: true, batchId: entry.batchId, entries: arr });
                }
                batchMap.get(entry.batchId)!.push(entry);
              } else {
                groups.push({ isBatch: false, entry });
              }
            }

            const kindBadgeClass = (kind: FeedEntry["kind"]) =>
              kind === "buy" ? "bg-rose-500/15 text-rose-400"
              : kind === "sell" ? "bg-emerald-500/15 text-emerald-400"
              : kind === "trade" ? "bg-violet-500/15 text-violet-400"
              : kind === "expense" ? "bg-amber-500/15 text-amber-400"
              : "bg-zinc-500/10 opacity-40";

            const kindLabel = (kind: FeedEntry["kind"]) =>
              kind === "buy" ? "BUY" : kind === "sell" ? "SELL" : kind === "trade" ? "TRADE" : kind === "expense" ? "EXP" : "PASS";

            function renderSingleEntry(entry: FeedEntry, compact = false) {
              const canUndo = entry.kind !== "pass" && !entry.pending;
              return (
                <div key={entry.id} className={`flex items-start gap-3 ${compact ? "py-1.5" : "py-2.5"} border-t first:border-t-0 ${entry.pending ? "opacity-70" : ""}`}>
                  {!compact && (
                    <div className="text-[10px] opacity-40 tabular-nums shrink-0 pt-0.5 w-14">{fmtTime(entry.time)}</div>
                  )}
                  {!compact && (
                    <div className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${kindBadgeClass(entry.kind)}`}>
                      {kindLabel(entry.kind)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className={`${compact ? "text-xs" : "text-sm"} leading-tight truncate`}>{entry.label}</div>
                    {entry.sub && <div className="text-[10px] opacity-40 mt-0.5">{entry.sub}</div>}
                  </div>
                  {entry.photoUrl && (
                    <button className="shrink-0 w-9 h-9 rounded-lg overflow-hidden border border-border/50" onClick={() => setLightboxUrl(entry.photoUrl!)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={entry.photoUrl} alt="" className="w-full h-full object-cover" />
                    </button>
                  )}
                  <div className="flex items-center gap-2 shrink-0">
                    {entry.amount != null && (
                      <div className={`${compact ? "text-xs" : "text-sm"} font-semibold tabular-nums ${entry.amount > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {entry.amount > 0 ? "+" : "−"}{money(Math.abs(entry.amount))}
                      </div>
                    )}
                    {entry.pending && (
                      <Clock size={12} className="text-amber-400 shrink-0" aria-label="Pending sync" />
                    )}
                    {canUndo && (
                      <button
                        onClick={() => handleUndo(entry.id)}
                        disabled={busy}
                        className="text-[10px] px-2 py-0.5 rounded border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 disabled:opacity-30 transition-colors"
                      >
                        Undo
                      </button>
                    )}
                  </div>
                </div>
              );
            }

            return groups.map((group, gi) => {
              if (!group.isBatch) return renderSingleEntry(group.entry);

              const { batchId, entries } = group;
              const expanded = expandedBatches.has(batchId);
              const totalAmt = entries.reduce((s, e) => s + (e.amount ?? 0), 0);
              const firstEntry = entries[0];
              const photoUrl = entries.find((e) => e.photoUrl)?.photoUrl;
              const toggle = () => setExpandedBatches((prev) => {
                const next = new Set(prev);
                next.has(batchId) ? next.delete(batchId) : next.add(batchId);
                return next;
              });

              return (
                <div key={batchId} className={gi > 0 ? "border-t" : ""}>
                  {/* Parent row */}
                  <button
                    className="w-full flex items-center gap-3 py-2.5 text-left"
                    onClick={toggle}
                  >
                    <div className="text-[10px] opacity-40 tabular-nums shrink-0 w-14">{fmtTime(firstEntry.time)}</div>
                    <div className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 bg-rose-500/15 text-rose-400">
                      BATCH BUY
                    </div>
                    <div className="flex-1 min-w-0 text-xs font-medium opacity-70">
                      {entries.length} cards
                    </div>
                    {photoUrl && (
                      <button
                        className="shrink-0 w-7 h-7 rounded-md overflow-hidden border border-border/50"
                        onClick={(e) => { e.stopPropagation(); setLightboxUrl(photoUrl); }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                      </button>
                    )}
                    <div className="text-sm font-semibold tabular-nums text-rose-400 shrink-0">
                      −{money(Math.abs(totalAmt))}
                    </div>
                    <ChevronDown
                      size={12}
                      className={`opacity-40 shrink-0 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
                    />
                  </button>
                  {/* Expanded children */}
                  {expanded && (
                    <div className="ml-4 pl-3 border-l-2 border-rose-500/10 mb-2">
                      {entries.map((e) => renderSingleEntry(e, true))}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}

"use client";

import type { InventorySearchResult } from "@/app/protected/show/actions";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SelectionVariant = "emerald" | "rose" | "violet";
export type FooterVariant = "sticker-or-market" | "market";

type Props = {
  items: InventorySearchResult[];
  isLoading: boolean;
  selectedIds: Set<string>;
  onToggle: (item: InventorySearchResult) => void;
  searchTerms: string[];
  selectionVariant?: SelectionVariant;
  footerVariant?: FooterVariant;
  emptyMessage?: string;
};

// ── Selection color palette ───────────────────────────────────────────────────

const PALETTE: Record<SelectionVariant, {
  badgeBg: string;
  ring: string;
  glow: string;
  shadow: string;
}> = {
  violet: {
    badgeBg: "#8b5cf6",
    ring: "rgba(139,92,246,0.55)",
    glow: "0 0 22px rgba(139,92,246,0.55), 0 6px 16px rgba(0,0,0,0.4)",
    shadow: "rgba(139,92,246,0.45)",
  },
  emerald: {
    badgeBg: "#34d399",
    ring: "rgba(52,211,153,0.55)",
    glow: "0 0 22px rgba(52,211,153,0.45), 0 6px 16px rgba(0,0,0,0.4)",
    shadow: "rgba(52,211,153,0.35)",
  },
  rose: {
    badgeBg: "#fb7185",
    ring: "rgba(251,113,133,0.55)",
    glow: "0 0 22px rgba(251,113,133,0.45), 0 6px 16px rgba(0,0,0,0.4)",
    shadow: "rgba(251,113,133,0.35)",
  },
};

// ── HighlightTerms (local copy — avoids cross-file coupling) ──────────────────

function HighlightTerms({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  for (const term of terms) {
    let idx = lower.indexOf(term);
    while (idx !== -1) {
      ranges.push([idx, idx + term.length]);
      idx = lower.indexOf(term, idx + 1);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of ranges) {
    if (merged.length && s <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    } else {
      merged.push([s, e]);
    }
  }
  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const [s, e] of merged) {
    if (pos < s) parts.push(<span key={`t${pos}`}>{text.slice(pos, s)}</span>);
    parts.push(
      <span key={`h${s}`} style={{ color: "var(--accent-primary)", fontWeight: 600 }}>
        {text.slice(s, e)}
      </span>
    );
    pos = e;
  }
  if (pos < text.length) parts.push(<span key={`tend`}>{text.slice(pos)}</span>);
  return <>{parts}</>;
}

// ── Money helper ──────────────────────────────────────────────────────────────

function money(v: number) {
  return `$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Card cell ─────────────────────────────────────────────────────────────────

function CardCell({
  item,
  selected,
  onToggle,
  searchTerms,
  palette,
  footerVariant,
}: {
  item: InventorySearchResult;
  selected: boolean;
  onToggle: () => void;
  searchTerms: string[];
  palette: (typeof PALETTE)[SelectionVariant];
  footerVariant: FooterVariant;
}) {
  const setLine = [item.set_name, item.card_number ? `#${item.card_number}` : null]
    .filter(Boolean)
    .join(" ");

  const priceDisplay =
    footerVariant === "sticker-or-market"
      ? item.sticker_price != null
        ? money(item.sticker_price)
        : item.market != null
        ? money(item.market)
        : "—"
      : item.market != null
      ? money(item.market)
      : null;

  return (
    <button
      onClick={onToggle}
      className="relative flex flex-col text-left rounded-xl overflow-hidden"
      style={{
        border: "none",
        background: "transparent",
        padding: 0,
        cursor: "pointer",
        width: "100%",
        transform: selected ? "scale(1.02)" : "scale(1)",
        transition: "transform 180ms cubic-bezier(0.34,1.56,0.64,1)",
        filter: selected ? `drop-shadow(0 6px 14px ${palette.shadow})` : "none",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* card image */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "2.5 / 3.5",
          borderRadius: 10,
          overflow: "hidden",
          border: selected ? `2px solid ${palette.ring}` : "1px solid rgba(255,255,255,0.06)",
          boxShadow: selected
            ? `0 0 0 1.5px ${palette.badgeBg}, ${palette.glow}`
            : "0 2px 6px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.04)",
          transition: "box-shadow 220ms ease, border-color 220ms ease",
          background: "var(--muted, #1e1b2e)",
        }}
      >
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center opacity-20 text-[10px] font-bold uppercase tracking-wide text-center px-1">
            {item.category}
          </div>
        )}

        {/* grade badge */}
        {item.grade && (
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
            <div className="text-[8px] font-bold text-white text-center truncate">{item.grade}</div>
          </div>
        )}

        {/* select sweep shine */}
        {selected && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background:
                "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.22) 50%, transparent 65%)",
              animation: "invGridSweep 520ms ease-out 1",
              mixBlendMode: "screen",
            }}
          />
        )}

        {/* check badge */}
        <div
          style={{
            position: "absolute",
            top: 5,
            right: 5,
            zIndex: 3,
            width: 20,
            height: 20,
            borderRadius: 999,
            background: selected ? palette.badgeBg : "rgba(13,11,20,0.55)",
            border: selected ? `1.5px solid rgba(255,255,255,0.5)` : "1.5px solid rgba(255,255,255,0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(6px)",
            transition: "all 200ms ease",
            boxShadow: selected ? `0 0 10px ${palette.shadow}` : "none",
          }}
        >
          {selected && (
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ animation: "invGridCheck 280ms ease-out both" }}
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      </div>

      {/* meta footer */}
      <div
        style={{
          padding: "6px 2px 4px",
          minWidth: 0,
          background: "transparent",
        }}
      >
        <div
          className="text-[10px] font-semibold leading-tight truncate"
          style={{
            color: selected ? "#f1f5f9" : "rgba(226,232,240,0.85)",
            transition: "color 200ms",
            letterSpacing: -0.1,
          }}
        >
          <HighlightTerms text={item.name} terms={searchTerms} />
        </div>
        {setLine && (
          <div className="text-[8.5px] opacity-40 truncate mt-0.5">
            <HighlightTerms text={setLine} terms={searchTerms} />
          </div>
        )}
        {priceDisplay && (
          <div
            className="text-[9px] tabular-nums mt-0.5"
            style={{
              color: selected ? palette.badgeBg : "rgba(148,163,184,0.7)",
              fontFeatureSettings: '"tnum"',
              transition: "color 200ms",
              fontWeight: selected ? 700 : 500,
            }}
          >
            {priceDisplay}
          </div>
        )}
      </div>
    </button>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="rounded-xl overflow-hidden animate-pulse" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="aspect-[2.5/3.5] bg-muted" style={{ aspectRatio: "2.5/3.5" }} />
          <div className="p-1.5 space-y-1 bg-transparent">
            <div className="h-2 bg-muted rounded w-3/4" />
            <div className="h-1.5 bg-muted rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Keyframe injection ────────────────────────────────────────────────────────
// Injected once on first render; idempotent via the id check.

function KeyframeStyle() {
  return (
    <style>{`
      @keyframes invGridSweep {
        from { opacity: 1; transform: translateX(-60%); }
        to   { opacity: 0; transform: translateX( 60%); }
      }
      @keyframes invGridCheck {
        from { opacity: 0; transform: scale(0.4); }
        to   { opacity: 1; transform: scale(1);   }
      }
    `}</style>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function InventoryCardGrid({
  items,
  isLoading,
  selectedIds,
  onToggle,
  searchTerms,
  selectionVariant = "violet",
  footerVariant = "sticker-or-market",
  emptyMessage = "No items in inventory",
}: Props) {
  const palette = PALETTE[selectionVariant];

  if (isLoading) return <SkeletonGrid />;

  if (items.length === 0) {
    return (
      <div className="text-xs opacity-40 text-center py-4">{emptyMessage}</div>
    );
  }

  return (
    <>
      <KeyframeStyle />
      <div className="grid grid-cols-3 gap-2">
        {items.map((item) => (
          <CardCell
            key={item.id}
            item={item}
            selected={selectedIds.has(item.id)}
            onToggle={() => onToggle(item)}
            searchTerms={searchTerms}
            palette={palette}
            footerVariant={footerVariant}
          />
        ))}
      </div>
    </>
  );
}

"use client";

import { createPortal } from "react-dom";

// ── Tab definitions ────────────────────────────────────────────────────────────

type TabKey = "scan" | "buy" | "sell" | "deal" | "trade";

// Inline SVG icons — stroke-only, 24px viewBox, matches lucide-react weight.
// Using custom paths from the design bundle rather than lucide components so
// the active stroke-width bump and drop-shadow filter work consistently.
function ScanIcon({ active }: { active: boolean }) {
  return (
    <svg width={21} height={21} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2.1 : 1.75}
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7V5a2 2 0 0 1 2-2h2" />
      <path d="M16 3h2a2 2 0 0 1 2 2v2" />
      <path d="M20 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M8 21H6a2 2 0 0 1-2-2v-2" />
      <path d="M4 12h16" />
    </svg>
  );
}

function BuyIcon({ active }: { active: boolean }) {
  return (
    <svg width={21} height={21} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2.1 : 1.75}
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function SellIcon({ active }: { active: boolean }) {
  return (
    <svg width={21} height={21} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2.1 : 1.75}
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
      <circle cx="7" cy="7" r="1.5" />
    </svg>
  );
}

function DealIcon({ active }: { active: boolean }) {
  return (
    <svg width={21} height={21} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2.1 : 1.75}
      strokeLinecap="round" strokeLinejoin="round">
      <path d="m11 17 2 2a1 1 0 1 0 3-3" />
      <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
      <path d="m21 3 1 11h-2" />
      <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
      <path d="M3 4h8" />
    </svg>
  );
}

function TradeIcon({ active }: { active: boolean }) {
  return (
    <svg width={21} height={21} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2.1 : 1.75}
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3 4 7l4 4" />
      <path d="M4 7h16" />
      <path d="m16 21 4-4-4-4" />
      <path d="M20 17H4" />
    </svg>
  );
}

const TABS: { key: TabKey; label: string; Icon: React.ComponentType<{ active: boolean }> }[] = [
  { key: "scan",  label: "Scan",  Icon: ScanIcon  },
  { key: "buy",   label: "Buy",   Icon: BuyIcon   },
  { key: "sell",  label: "Sell",  Icon: SellIcon  },
  { key: "deal",  label: "Deal",  Icon: DealIcon  },
  { key: "trade", label: "Trade", Icon: TradeIcon },
];

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  tab: TabKey;
  setTab: (t: TabKey) => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function BottomTabBar({ tab, setTab }: Props) {
  const idx = TABS.findIndex((t) => t.key === tab);
  const pct = 100 / TABS.length;

  return createPortal(
    <div
      className="show-mode-bottom-nav md:hidden"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: "8px 8px calc(8px + env(safe-area-inset-bottom, 0px))",
        background: `
          linear-gradient(180deg, rgba(18,14,30,0) 0%, rgba(13,11,20,0.85) 35%, rgba(13,11,20,0.95) 100%),
          rgba(13,11,20,0.92)
        `,
        backdropFilter: "blur(16px) saturate(180%)",
        WebkitBackdropFilter: "blur(16px) saturate(180%)",
        borderTop: "1px solid rgba(139,92,246,0.14)",
        boxShadow: "0 -8px 24px rgba(0,0,0,0.35)",
      }}
    >
      {/* inner rail */}
      <div
        style={{
          position: "relative",
          display: "flex",
          height: 54,
          borderRadius: 14,
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.04)",
          padding: 3,
        }}
      >
        {/* sliding lit pill */}
        <div
          style={{
            position: "absolute",
            top: 3,
            bottom: 3,
            width: `calc(${pct}% - 2px)`,
            left: `calc(${idx * pct}% + 1px)`,
            borderRadius: 11,
            background: "linear-gradient(180deg, #8b5cf6 0%, #6d42d8 100%)",
            boxShadow: `
              0 4px 14px rgba(139,92,246,0.45),
              0 0 20px rgba(139,92,246,0.30),
              inset 0 1px 0 rgba(255,255,255,0.2),
              inset 0 -1px 0 rgba(0,0,0,0.2)
            `,
            transition: "left 280ms cubic-bezier(0.32, 0.72, 0, 1)",
            zIndex: 1,
            pointerEvents: "none",
          }}
        >
          {/* inner shine */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 11,
              background: "radial-gradient(60% 40% at 50% 0%, rgba(255,255,255,0.22), transparent 70%)",
            }}
          />
        </div>

        {/* tab buttons */}
        {TABS.map((t) => {
          const isActive = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1,
                position: "relative",
                zIndex: 2,
                background: "transparent",
                border: "none",
                padding: "6px 0 4px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                color: isActive ? "#ffffff" : "rgba(148,163,184,0.85)",
                cursor: "pointer",
                transition: "color 200ms ease",
              }}
            >
              <div
                style={{
                  transform: isActive ? "scale(1.05)" : "scale(1)",
                  transition: "transform 240ms cubic-bezier(0.34,1.56,0.64,1)",
                  filter: isActive ? "drop-shadow(0 0 8px rgba(255,255,255,0.35))" : "none",
                }}
              >
                <t.Icon active={isActive} />
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: isActive ? 700 : 500,
                  letterSpacing: isActive ? 0.2 : 0.15,
                  lineHeight: 1,
                }}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}

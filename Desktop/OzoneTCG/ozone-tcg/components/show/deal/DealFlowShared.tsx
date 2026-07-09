// Shared types, StepBar, and helpers for the 4-step deal flow.

import type { InventorySearchResult } from "@/app/protected/show/actions";

// ── Re-exported types (consumed by ShowClient + all step components) ──────────

export type DealCard = {
  _id: string;
  name: string;
  grade: string;
  condition: string;
  marketPrice: number | null;
  buyPrice: number | null;
  image_url: string | null;
  set_name: string | null;
  card_number: string | null;
  disposition: "undecided" | "cash" | "trade";
  certData?: { company: string; certNumber: string } | null;
};

export type DealStep = "evaluate" | "quote" | "fulfill" | "complete";
export type DealCustomerChoice = "undecided" | "all-cash" | "all-trade" | "split";
export type DealTradeSelection = { item: InventorySearchResult; tradeValue: string };
export type SortBy = "name" | "price-high" | "price-low" | "recent";
export type PriceRange = "all" | "under25" | "25to100" | "100to500" | "over500";

// ── Money helpers ─────────────────────────────────────────────────────────────

export function money(v: number | null | undefined) {
  if (v == null) return "—";
  return `$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function moneyRound(v: number) {
  return `$${Math.round(v).toLocaleString()}`;
}

// ── StepBar ───────────────────────────────────────────────────────────────────

const STEP_LABELS: Record<DealStep, string> = {
  evaluate: "Evaluate",
  quote: "Quote",
  fulfill: "Fulfill",
  complete: "Complete",
};
const STEP_ORDER: DealStep[] = ["evaluate", "quote", "fulfill", "complete"];

export function StepBar({
  step,
  onStepChange,
}: {
  step: DealStep;
  onStepChange: (s: DealStep) => void;
}) {
  const idx = STEP_ORDER.indexOf(step);

  return (
    <div
      className="flex items-center gap-1.5 px-4 py-2.5"
      style={{
        background: "rgba(13,11,20,0.6)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid rgba(139,92,246,0.12)",
      }}
    >
      {STEP_ORDER.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={s} className="flex items-center gap-1.5 flex-1 min-w-0">
            <button
              onClick={() => { if (i <= idx) onStepChange(s); }}
              disabled={i > idx}
              className="flex items-center gap-1.5 shrink-0"
              style={{ background: "none", border: "none", padding: 0, cursor: i <= idx ? "pointer" : "default" }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 8.5,
                  fontWeight: 800,
                  fontFamily: "'JetBrains Mono', monospace",
                  background: done
                    ? "linear-gradient(180deg, #8b5cf6, #6d42d8)"
                    : active
                    ? "rgba(139,92,246,0.2)"
                    : "rgba(255,255,255,0.06)",
                  color: done ? "#fff" : active ? "#c4b5fd" : "#64748b",
                  border: active
                    ? "1.5px solid #8b5cf6"
                    : "1px solid rgba(255,255,255,0.08)",
                  boxShadow: active ? "0 0 10px rgba(139,92,246,0.4)" : "none",
                  flexShrink: 0,
                }}
              >
                {done ? "✓" : i + 1}
              </div>
              {active && (
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#f8fafc",
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: "nowrap",
                  }}
                >
                  {STEP_LABELS[s]}
                </span>
              )}
            </button>
            {i < STEP_ORDER.length - 1 && (
              <div
                className="flex-1"
                style={{
                  height: 1,
                  background: done
                    ? "linear-gradient(90deg, #8b5cf6, rgba(139,92,246,0.2))"
                    : "rgba(255,255,255,0.08)",
                  minWidth: 4,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Shared CTA footer ─────────────────────────────────────────────────────────

export function StepFooter({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-2.5 px-4 pt-2.5 pb-3"
      style={{
        background: "linear-gradient(180deg, rgba(13,11,20,0) 0%, rgba(13,11,20,0.96) 40%)",
        borderTop: "1px solid rgba(139,92,246,0.18)",
        backdropFilter: "blur(14px)",
      }}
    >
      {children}
    </div>
  );
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 44,
        padding: "0 14px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        color: "#94a3b8",
        fontWeight: 600,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      ← Back
    </button>
  );
}

export function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        height: 44,
        borderRadius: 12,
        background: disabled ? "rgba(139,92,246,0.2)" : "linear-gradient(180deg, #8b5cf6, #6d42d8)",
        border: "none",
        color: "#fff",
        fontWeight: 700,
        fontSize: 14,
        boxShadow: disabled ? "none" : "0 6px 18px rgba(139,92,246,0.4)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      {children}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M13 5l7 7-7 7" />
      </svg>
    </button>
  );
}

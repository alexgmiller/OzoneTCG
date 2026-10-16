"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Square, X } from "lucide-react";
import { IconButton, MoneyDisplay, TabStrip, useToast } from "@/components/ui";
import { startAutoSync } from "@/lib/offlineSync";
import { endShowSession, startShow, type ActiveShowInfo } from "@/app/protected/shows/actions";
import type { Mode, PickItem } from "./ledger";
import { BTN_ACCENT, CARD, INPUT } from "./ui";
import BuyMode from "./BuyMode";
import SellMode from "./SellMode";
import TradeMode from "./TradeMode";

// ── POS ──
// Buy | Sell | Trade tab strip, the active-show chip under it (tap to detach
// a deal from the show), then the mode's form on surface cards. Starting and
// ending a show lives here, not on a separate page.
const MODES = [{ value: "buy", label: "Buy" }, { value: "sell", label: "Sell" }, { value: "trade", label: "Trade" }] as const;

export default function PosClient({ activeShow, scheduled, items, buyPct, initialMode, preselected }: {
  activeShow: ActiveShowInfo | null;
  scheduled: { id: string; name: string } | null;
  items: PickItem[];
  buyPct: number;
  initialMode: Mode;
  preselected: PickItem[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [attached, setAttached] = useState(true);
  const [showName, setShowName] = useState(scheduled?.name ?? "");
  const [cash, setCash] = useState("");
  const [ending, setEnding] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => startAutoSync(), []);

  const showId = activeShow && attached ? activeShow.id : null;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      setCash(""); setEnding(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 py-4 pb-44 md:pb-4">
      <h1 className="sr-only">POS</h1>

      <TabStrip value={mode} onChange={setMode} tabs={MODES} aria-label="Deal type" />

      {/* ── Show session ── */}
      {activeShow ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAttached((a) => !a)}
              aria-pressed={attached}
              title={attached ? "Detach this deal from the show" : "Attach to the show"}
              className={`flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors duration-150 ${
                attached ? "bg-accent-tint text-accent" : "bg-surface-2 text-muted-foreground"
              }`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${attached ? "animate-pulse bg-accent" : "bg-muted-foreground"}`} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-left">{attached ? `At ${activeShow.name}` : "Not attached to the show"}</span>
              {attached && <span className="shrink-0 tabular-nums"><MoneyDisplay amount={activeShow.expected_cash} tone="neutral" className="text-accent" /></span>}
              {attached && <X size={16} className="shrink-0" aria-hidden />}
            </button>
            <IconButton label="End show" active={ending} onClick={() => setEnding((e) => !e)}>
              <Square size={18} strokeWidth={1.75} />
            </IconButton>
          </div>
          {ending && (
            <div className={CARD}>
              <p className="section-label">End {activeShow.name}</p>
              <div className="flex gap-2">
                <input className={`${INPUT} flex-1 tabular-nums`} type="number" inputMode="decimal" value={cash}
                  onChange={(e) => setCash(e.target.value)} placeholder="Counted cash (optional)" aria-label="Counted cash" />
                <button type="button" className={BTN_ACCENT} disabled={busy}
                  onClick={() => run(() => endShowSession(activeShow.id, cash ? Number(cash) : null))}>
                  End show
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className={CARD}>
          <p className="section-label">Start a show</p>
          <input className={`${INPUT} w-full`} value={showName} onChange={(e) => setShowName(e.target.value)} placeholder="Show name" aria-label="Show name" />
          <div className="flex gap-2">
            <input className={`${INPUT} flex-1 tabular-nums`} type="number" inputMode="decimal" value={cash}
              onChange={(e) => setCash(e.target.value)} placeholder="Starting cash" aria-label="Starting cash" />
            <button type="button" className={BTN_ACCENT} disabled={busy || !showName.trim()}
              onClick={() => run(() => startShow({
                scheduledId: scheduled && showName === scheduled.name ? scheduled.id : null,
                name: showName, starting_cash: cash ? Number(cash) : null,
                date: new Date().toLocaleDateString("en-CA"),
              }))}>
              Start
            </button>
          </div>
        </div>
      )}

      {mode === "buy" && <BuyMode showId={showId} buyPct={buyPct} />}
      {mode === "sell" && <SellMode showId={showId} items={items} initial={initialMode === "sell" ? preselected : []} />}
      {mode === "trade" && <TradeMode showId={showId} items={items} initial={initialMode === "trade" ? preselected : []} />}
    </div>
  );
}

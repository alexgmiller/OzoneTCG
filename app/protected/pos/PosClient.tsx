"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import { startAutoSync } from "@/lib/offlineSync";
import { endShowSession, startShow, type ActiveShowInfo } from "@/app/protected/shows/actions";
import type { Mode, PickItem } from "./ledger";
import BuyMode from "./BuyMode";
import SellMode from "./SellMode";
import TradeMode from "./TradeMode";

const input = "h-10 border rounded-lg px-3 text-sm bg-background min-w-0";
const button = "h-10 px-3 rounded-lg border text-sm font-medium whitespace-nowrap disabled:opacity-40";

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
    <div className="w-full max-w-xl mx-auto py-4 space-y-4">
      {/* Show session */}
      <header className="border rounded-xl p-3 space-y-2">
        {activeShow ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setAttached((a) => !a)} title="Attach deals to this show"
              className={`${button} truncate ${attached ? "border-primary text-primary" : "text-muted-foreground"}`}>
              {attached ? `● ${activeShow.name} ✕` : "Not attached · tap to attach"}
            </button>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">Cash ${activeShow.expected_cash.toFixed(2)}</span>
            <button type="button" className={button} onClick={() => setEnding((e) => !e)}>End</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input className={`${input} flex-1`} value={showName} onChange={(e) => setShowName(e.target.value)} placeholder="Show name" />
            <input className={`${input} w-24`} type="number" inputMode="decimal" value={cash}
              onChange={(e) => setCash(e.target.value)} placeholder="Cash" aria-label="Starting cash" />
            <button type="button" className={button} disabled={busy || !showName.trim()}
              onClick={() => run(() => startShow({
                scheduledId: scheduled && showName === scheduled.name ? scheduled.id : null,
                name: showName, starting_cash: cash ? Number(cash) : null,
              }))}>
              Start show
            </button>
          </div>
        )}
        {activeShow && ending && (
          <div className="flex gap-2">
            <input className={`${input} flex-1`} type="number" inputMode="decimal" value={cash}
              onChange={(e) => setCash(e.target.value)} placeholder="Counted cash (optional)" />
            <button type="button" className={button} disabled={busy}
              onClick={() => run(() => endShowSession(activeShow.id, cash ? Number(cash) : null))}>
              End show
            </button>
          </div>
        )}
      </header>

      {/* Mode */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-muted">
        {(["buy", "sell", "trade"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`h-11 rounded-lg text-sm font-semibold capitalize ${mode === m ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
            {m}
          </button>
        ))}
      </div>

      {mode === "buy" && <BuyMode showId={showId} buyPct={buyPct} />}
      {mode === "sell" && <SellMode showId={showId} items={items} initial={initialMode === "sell" ? preselected : []} />}
      {mode === "trade" && <TradeMode showId={showId} items={items} initial={initialMode === "trade" ? preselected : []} />}
    </div>
  );
}

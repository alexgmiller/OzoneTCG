"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button, Input, MoneyDisplay, Page, PageHeader, Segmented, useConfirm, useToast } from "@/components/ui";
import { startAutoSync } from "@/lib/offlineSync";
import { endShowSession, startShow, type ActiveShowInfo } from "@/app/protected/shows/actions";
import type { Mode, PickItem } from "./ledger";
import BuyMode from "./BuyMode";
import SellMode from "./SellMode";
import TradeMode from "./TradeMode";

const MODES: { value: Mode; label: string }[] = [
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
  { value: "trade", label: "Trade" },
];

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
  const confirm = useConfirm();
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

  async function endShow(show: ActiveShowInfo) {
    const ok = await confirm({
      title: `End ${show.name}?`,
      description: "The show closes and new deals stop attaching to it.",
      confirmLabel: "End show",
      destructive: true,
    });
    if (!ok) return;
    await run(() => endShowSession(show.id, cash ? Number(cash) : null));
  }

  return (
    <Page>
      <PageHeader title="POS" />

      {/* ── Show session ── */}
      <header className={`space-y-3 rounded-xl border p-3 ${
        activeShow && attached ? "border-accent-primary-border bg-accent-primary-soft" : "border-border bg-card"
      }`}>
        {activeShow ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setAttached((a) => !a)} title="Attach deals to this show"
              aria-pressed={attached}
              className={`flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors duration-150 ${
                attached ? "border-accent-primary bg-background text-primary" : "border-border bg-background text-muted-foreground"
              }`}>
              {attached ? (
                <>
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent-primary" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-left">{activeShow.name}</span>
                  <X size={16} className="shrink-0" aria-hidden />
                </>
              ) : (
                <span className="truncate">Not attached · tap to attach</span>
              )}
            </button>
            <div className="shrink-0 text-right">
              <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Cash in drawer</div>
              <MoneyDisplay amount={activeShow.expected_cash} tone="neutral" className="text-base font-semibold text-foreground" />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">No show running · start one to attach deals</p>
            <Input value={showName} onChange={(e) => setShowName(e.target.value)} placeholder="Show name" />
            <div className="flex gap-2">
              <Input className="flex-1" type="number" inputMode="decimal" value={cash}
                onChange={(e) => setCash(e.target.value)} placeholder="Starting cash" aria-label="Starting cash" />
              <Button variant="outline" className="shrink-0" disabled={busy || !showName.trim()}
                onClick={() => run(() => startShow({
                  scheduledId: scheduled && showName === scheduled.name ? scheduled.id : null,
                  name: showName, starting_cash: cash ? Number(cash) : null,
                  date: new Date().toLocaleDateString("en-CA"),
                }))}>
                Start show
              </Button>
            </div>
          </div>
        )}
        {/* Ending lives on its own row, away from the attach toggle, behind a confirm */}
        {activeShow && !ending && (
          <div className="flex justify-end border-t border-border pt-2">
            <Button variant="destructive-ghost" size="sm" onClick={() => setEnding(true)} aria-expanded={false}>
              End show…
            </Button>
          </div>
        )}
        {activeShow && ending && (
          <div className="space-y-2 border-t border-border pt-3">
            <Input type="number" inputMode="decimal" value={cash}
              onChange={(e) => setCash(e.target.value)} placeholder="Counted cash (optional)" aria-label="Counted cash" />
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" disabled={busy} onClick={() => { setEnding(false); setCash(""); }}>
                Cancel
              </Button>
              <Button variant="destructive" className="flex-1" loading={busy} onClick={() => endShow(activeShow)}>
                End show
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* ── Mode ── */}
      <Segmented size="lg" options={MODES} value={mode} onChange={setMode} aria-label="Deal type" />

      {mode === "buy" && <BuyMode showId={showId} buyPct={buyPct} />}
      {mode === "sell" && <SellMode showId={showId} items={items} initial={initialMode === "sell" ? preselected : []} />}
      {mode === "trade" && <TradeMode showId={showId} items={items} initial={initialMode === "trade" ? preselected : []} />}
    </Page>
  );
}

"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useToast } from "@/components/ui";
import { syncedAgo } from "@/lib/catalog/tcgplayerSyncStatus";
import { checkPriceSources, syncJapaneseCatalog, type JapaneseCatalogStatus } from "../actions";
import { ActionButton, Section, SettingRow, StatusDot } from "./SettingsPrimitives";

export type ApiStatus = { ebay: boolean; justtcg: boolean; psa: boolean; ppt: boolean };

// ── Pricing sources ──
export function PricingSourcesSection({
  apiStatus,
  japaneseCatalog,
}: {
  apiStatus: ApiStatus;
  japaneseCatalog: JapaneseCatalogStatus | null;
}) {
  return (
    <Section icon={KeyRound} title="Pricing Sources">
      <SettingRow label="eBay Browse API" description="Slab comps and sold listings · EBAY_APP_ID + EBAY_CERT_ID">
        <StatusDot ok={apiStatus.ebay} label="Not configured" />
      </SettingRow>
      <SettingRow label="JustTCG / TCGPlayer" description="Raw card pricing · JUSTTCG_API_KEY">
        <StatusDot ok={apiStatus.justtcg} label="Not configured" />
      </SettingRow>
      <SettingRow label="PSA Cert Lookup" description="Cert scanner · PSA_API_KEY">
        <StatusDot ok={apiStatus.psa} label="Not configured" />
      </SettingRow>
      <SettingRow label="PokemonPriceTracker" description="Sealed prices · POKEMON_PRICE_TRACKER_API_KEY">
        <StatusDot ok={apiStatus.ppt} label="Not configured" />
      </SettingRow>
      <JapaneseCatalogRow initial={japaneseCatalog} />
      <CheckSourcesRow />
      <SettingRow
        label="Auto-refresh"
        description="High value (over $200): 2 hrs · Mid ($50–$200): 4 hrs · Low (under $50): 8 hrs"
      />
      <p className="px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        API keys live in your Vercel project&apos;s environment variables and are never stored here.
        To add or rotate a key, update it there and redeploy.
      </p>
    </Section>
  );
}

// ── Japanese catalog ──
// Search's Japanese tab: TCGplayer's Japanese cards, refreshed nightly. Sync
// now runs the same job on demand (a few seconds).
function JapaneseCatalogRow({ initial }: { initial: JapaneseCatalogStatus | null }) {
  const toast = useToast();
  const [status, setStatus] = useState(initial);
  const [syncing, setSyncing] = useState(false);

  async function sync() {
    setSyncing(true);
    try {
      const r = await syncJapaneseCatalog();
      if (r.status) setStatus(r.status);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    } catch {
      toast.error("Sync didn't run. Check your connection and try again.");
    } finally {
      setSyncing(false);
    }
  }

  const description = !status
    ? "TCGplayer cards for Search's Japanese tab · status unavailable"
    : status.cards === 0 || !status.lastSynced
      ? "TCGplayer cards for Search's Japanese tab · not synced yet (runs nightly)"
      : `${status.cards.toLocaleString()} cards for Search's Japanese tab · synced ${syncedAgo(status.lastSynced)}`;

  return (
    <SettingRow label="Japanese catalog (TCGplayer)" description={description} stack>
      <ActionButton onClick={sync} disabled={syncing} className="w-full sm:w-auto">
        {syncing ? "Syncing…" : "Sync now"}
      </ActionButton>
    </SettingRow>
  );
}

// ── Check price sources ──
// Asks PokemonPriceTracker and eBay about one card and shows what each sent
// back (shortened), so we can see whether the key works and what data comes
// with it. Costs a few PokemonPriceTracker credits per tap.
function CheckSourcesRow() {
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function check() {
    setChecking(true);
    try {
      setResult(JSON.stringify(await checkPriceSources(), null, 1));
    } catch {
      toast.error("The check didn't run. Check your connection and try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div>
      <SettingRow label="Check price sources" description="One PokemonPriceTracker call and one eBay search for Psyduck 286/SM-P" stack>
        <ActionButton onClick={check} disabled={checking} className="w-full sm:w-auto">
          {checking ? "Checking…" : "Check"}
        </ActionButton>
      </SettingRow>
      {result && (
        <div className="px-4 pb-3">
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-surface-2 p-3 font-mono text-xs text-foreground">
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}

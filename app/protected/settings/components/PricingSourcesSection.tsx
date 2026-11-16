"use client";

import { KeyRound } from "lucide-react";
import { Section, SettingRow, StatusDot } from "./SettingsPrimitives";

export type ApiStatus = { ebay: boolean; justtcg: boolean; psa: boolean };

// ── Pricing sources ──
export function PricingSourcesSection({ apiStatus }: { apiStatus: ApiStatus }) {
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

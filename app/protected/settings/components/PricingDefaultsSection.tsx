"use client";

import { TrendingUp } from "lucide-react";
import type { UserSettings } from "../actions";
import {
  Section, SettingRow, RowGroupLabel, NumInput, Segmented,
  type SettingsUpdate,
} from "./SettingsPrimitives";

const STRATEGIES = [
  { value: "auto", label: "Auto" },
  { value: "q1", label: "Q1" },
  { value: "median", label: "Median" },
  { value: "q3", label: "Q3" },
] as const;

// ── Pricing defaults ──
export function PricingDefaultsSection({
  settings,
  onChange,
}: {
  settings: UserSettings;
  onChange: SettingsUpdate;
}) {
  return (
    <Section icon={TrendingUp} title="Pricing Defaults">
      <SettingRow label="Default buy percentage" description="Pre-fills when recording buys">
        <NumInput value={settings.default_buy_pct} onChange={(v) => onChange("default_buy_pct", v)} />
      </SettingRow>
      <SettingRow label="Default trade credit" description="Pre-fills when recording trades">
        <NumInput value={settings.default_trade_pct} onChange={(v) => onChange("default_trade_pct", v)} />
      </SettingRow>
      <SettingRow label="Default consigner rate" description="Pre-fills when creating consigners">
        <NumInput
          value={settings.default_consigner_rate}
          onChange={(v) => onChange("default_consigner_rate", v)}
        />
      </SettingRow>
      <SettingRow label="Grading cost per card" description="PSA standard service fee, used in grading ROI">
        <NumInput
          value={settings.grading_cost}
          onChange={(v) => onChange("grading_cost", v)}
          min={0}
          max={500}
          unit="$"
        />
      </SettingRow>

      <RowGroupLabel>Price movement thresholds</RowGroupLabel>
      <SettingRow label="Dropping threshold" description="Below this % flags a price drop">
        <NumInput value={settings.drop_threshold} onChange={(v) => onChange("drop_threshold", v)} />
      </SettingRow>
      <SettingRow label="Rising threshold" description="Above this % flags a price rise">
        <NumInput value={settings.rise_threshold} onChange={(v) => onChange("rise_threshold", v)} />
      </SettingRow>
      <SettingRow label="Spiking threshold" description="Above this % flags a spike">
        <NumInput value={settings.spike_threshold} onChange={(v) => onChange("spike_threshold", v)} />
      </SettingRow>

      <RowGroupLabel>FMV strategy</RowGroupLabel>
      <SettingRow stack label="Slab pricing strategy" description="Which percentile to use as FMV for graded cards">
        <Segmented
          value={settings.pricing_strategy}
          options={STRATEGIES}
          onChange={(v) => onChange("pricing_strategy", v)}
        />
      </SettingRow>
    </Section>
  );
}

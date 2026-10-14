"use client";

import { Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import type { UserSettings } from "../actions";
import { Section, SettingRow, Segmented, inputClass, type SettingsUpdate } from "./SettingsPrimitives";

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

type ThemeValue = (typeof THEMES)[number]["value"];

// ── Display preferences ──
export function DisplaySection({
  settings,
  onChange,
}: {
  settings: UserSettings;
  onChange: SettingsUpdate;
}) {
  const { theme: currentTheme, setTheme } = useTheme();
  const activeTheme = (currentTheme ?? settings.theme) as ThemeValue;

  return (
    <Section icon={Monitor} title="Display">
      <SettingRow stack label="Theme" description="Light is the default; system follows your device">
        <Segmented
          value={activeTheme}
          options={THEMES}
          onChange={(v) => { setTheme(v); onChange("theme", v); }}
        />
      </SettingRow>
      <SettingRow stack label="Currency">
        <select
          value={settings.currency}
          onChange={(e) => onChange("currency", e.target.value)}
          className={cn(inputClass, "w-full sm:w-auto")}
        >
          <option value="USD">USD ($)</option>
          <option value="CAD">CAD ($)</option>
          <option value="EUR">EUR (€)</option>
        </select>
      </SettingRow>
      <SettingRow stack label="Default sort" description="How inventory is ordered when you open it">
        <select
          value={settings.default_sort}
          onChange={(e) => onChange("default_sort", e.target.value)}
          className={cn(inputClass, "w-full sm:w-auto")}
        >
          <option value="date-desc">Recently Added</option>
          <option value="date-asc">Oldest First</option>
          <option value="name-asc">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
          <option value="market-desc">Price High–Low</option>
          <option value="market-asc">Price Low–High</option>
        </select>
      </SettingRow>
    </Section>
  );
}

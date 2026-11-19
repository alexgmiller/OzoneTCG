"use client";

import { useEffect, useState } from "react";
import { Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import type { UserSettings } from "../actions";
import type { SortDir, SortField, SortKey } from "@/app/protected/inventory/types";
import { SORT_FIELDS, parseSort, sortFieldOption, sortForField, toSortKey } from "@/app/protected/inventory/sort";
import { Section, SettingRow, Segmented, inputClass, type SettingsUpdate } from "./SettingsPrimitives";

const THEMES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
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
  // next-themes only knows the device's theme in the browser. Render the saved
  // setting on the server and the first client pass so hydration matches, then
  // switch to the live theme (same approach as ThemeSwitcher).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const activeTheme = ((mounted ? currentTheme : null) ?? settings.theme) as ThemeValue;

  return (
    <Section icon={Monitor} title="Display">
      <SettingRow stack label="Theme" description="System follows your device; both light and dark are first-class">
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
        <DefaultSort value={settings.default_sort} onChange={(k) => onChange("default_sort", k)} />
      </SettingRow>
    </Section>
  );
}

// ── Default sort ──
// Same shape as Inventory's sort: a field, then its direction. Still stored
// as one SortKey ("date-desc"); picking a field starts at its natural direction.
function DefaultSort({ value, onChange }: { value: string; onChange: (k: SortKey) => void }) {
  const { field, dir } = parseSort(value);
  const option = sortFieldOption(field);
  const other: SortDir = option.defaultDir === "desc" ? "asc" : "desc";
  const dirs = [option.defaultDir, other].map((d) => ({ value: d, label: option.dirLabel[d] }));

  return (
    <div className="flex flex-col gap-2">
      <select
        value={field}
        onChange={(e) => onChange(sortForField(toSortKey(field, dir), e.target.value as SortField))}
        aria-label="Default sort field"
        className={cn(inputClass, "w-full")}
      >
        {SORT_FIELDS.map((f) => (
          <option key={f.field} value={f.field}>{f.label}</option>
        ))}
      </select>
      <Segmented value={dir} options={dirs} onChange={(d) => onChange(toSortKey(field, d))} />
    </div>
  );
}

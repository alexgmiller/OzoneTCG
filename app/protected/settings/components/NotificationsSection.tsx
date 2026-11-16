"use client";

import { Bell } from "lucide-react";
import type { UserSettings } from "../actions";
import { Section, SettingRow, NumInput, type SettingsUpdate } from "./SettingsPrimitives";

// ── Notifications ──
export function NotificationsSection({
  settings,
  onChange,
}: {
  settings: UserSettings;
  onChange: SettingsUpdate;
}) {
  return (
    <Section icon={Bell} title="Notifications">
      <SettingRow
        label="Price alert threshold"
        description="Coming soon: notify when a price moves more than this %"
      >
        <div className="flex items-center gap-2">
          <NumInput
            value={settings.price_alert_threshold}
            onChange={(v) => onChange("price_alert_threshold", v)}
          />
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Soon
          </span>
        </div>
      </SettingRow>
    </Section>
  );
}

"use client";

import { User } from "lucide-react";
import { Input } from "@/components/ui";
import type { UserSettings } from "../actions";
import { Section, SettingRow, type SettingsUpdate } from "./SettingsPrimitives";

// ── Profile ──
export function ProfileSection({
  email,
  settings,
  onChange,
}: {
  email: string;
  settings: UserSettings;
  onChange: SettingsUpdate;
}) {
  return (
    <Section icon={User} title="Profile">
      <SettingRow stack label="Display name" description="Used in the nav greeting">
        <Input
          type="text"
          placeholder={email.split("@")[0]}
          value={settings.display_name ?? ""}
          onChange={(e) => onChange("display_name", e.target.value || null)}
          className="sm:w-48"
        />
      </SettingRow>
      <SettingRow stack label="Email" description="Your sign-in email">
        <span className="block break-all font-mono text-sm text-muted-foreground sm:text-right">{email}</span>
      </SettingRow>
      <SettingRow stack label="Business name" description="Shown in consigner portals">
        <Input
          type="text"
          placeholder="OzoneTCG"
          value={settings.business_name ?? ""}
          onChange={(e) => onChange("business_name", e.target.value || null)}
          className="sm:w-48"
        />
      </SettingRow>
    </Section>
  );
}

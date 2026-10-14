"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  saveSettings,
  type UserSettings, type WorkspaceData, type SavedLocation,
} from "./actions";
import type { SettingsUpdate } from "./components/SettingsPrimitives";
import { ProfileSection } from "./components/ProfileSection";
import { PricingDefaultsSection } from "./components/PricingDefaultsSection";
import { DisplaySection } from "./components/DisplaySection";
import { NotificationsSection } from "./components/NotificationsSection";
import { PricingSourcesSection, type ApiStatus } from "./components/PricingSourcesSection";
import { DataSection } from "./components/DataSection";
import { StorageSection } from "./components/StorageSection";
import { OfflineSyncSection } from "./components/OfflineSyncSection";
import { LocationsSection } from "./components/LocationsSection";
import { AccountSection } from "./components/AccountSection";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type Timer = ReturnType<typeof setTimeout>;

const DEBOUNCE_MS = 700;

// ── Save indicator ──
function SaveIndicator({ status }: { status: SaveStatus }) {
  return (
    <div
      aria-live="polite"
      className={cn(
        "flex items-center gap-1.5 text-xs transition-opacity duration-150",
        status === "idle" ? "opacity-0" : "opacity-100",
      )}
    >
      {status === "saving" && <span className="animate-pulse text-muted-foreground">Saving…</span>}
      {status === "saved" && (
        <>
          <CheckCircle2 size={14} className="text-positive-strong" />
          <span className="text-positive-strong">Saved</span>
        </>
      )}
      {status === "error" && (
        <>
          <AlertCircle size={14} className="text-negative-strong" />
          <span className="text-negative-strong">Save failed</span>
        </>
      )}
    </div>
  );
}

// ── Settings page ──
export default function SettingsClient({
  email,
  settings: initialSettings,
  workspaceData,
  apiStatus,
  savedLocations = [],
}: {
  email: string;
  settings: UserSettings;
  workspaceData: WorkspaceData;
  apiStatus: ApiStatus;
  savedLocations?: SavedLocation[];
}) {
  const [settings, setSettings] = useState<UserSettings>(initialSettings);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // Debounced edits accumulate here so a fast switch between fields never drops one.
  const pendingRef = useRef<Partial<UserSettings>>({});
  const debounceRef = useRef<Timer | null>(null);
  const statusRef = useRef<Timer | null>(null);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (statusRef.current) clearTimeout(statusRef.current);
  }, []);

  const persistSave = useCallback(async (patch: Partial<UserSettings>) => {
    if (statusRef.current) clearTimeout(statusRef.current);
    setSaveStatus("saving");
    try {
      await saveSettings(patch);
      setSaveStatus("saved");
      statusRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
      statusRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, []);

  function takePending(): Partial<UserSettings> {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    const pending = pendingRef.current;
    pendingRef.current = {};
    return pending;
  }

  const updateImmediate: SettingsUpdate = (key, value) => {
    const patch = { ...takePending(), [key]: value } as Partial<UserSettings>;
    setSettings((prev) => ({ ...prev, ...patch }));
    persistSave(patch);
  };

  const updateDebounced: SettingsUpdate = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    pendingRef.current = { ...pendingRef.current, [key]: value };
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persistSave(takePending()), DEBOUNCE_MS);
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 py-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Settings</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Your workspace and preferences</p>
        </div>
        <SaveIndicator status={saveStatus} />
      </header>

      <ProfileSection email={email} settings={settings} onChange={updateDebounced} />
      <PricingDefaultsSection settings={settings} onChange={updateImmediate} />
      <DisplaySection settings={settings} onChange={updateImmediate} />
      <NotificationsSection settings={settings} onChange={updateImmediate} />
      <PricingSourcesSection apiStatus={apiStatus} />
      <DataSection />
      <StorageSection />
      <OfflineSyncSection />
      <LocationsSection homeAddress={workspaceData.home_address} savedLocations={savedLocations} />
      <AccountSection />
    </div>
  );
}

import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Skeleton } from "@/components/ui";
import { loadSettings, loadWorkspaceData, getSavedLocations } from "./actions";
import SettingsClient from "./SettingsClient";

// ── Loader ──
async function SettingsLoader() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return <div className="py-6 text-center text-sm text-muted-foreground">Not signed in.</div>;
  }

  const [settings, workspaceData, savedLocations] = await Promise.all([
    loadSettings(),
    loadWorkspaceData(),
    getSavedLocations().catch(() => []),
  ]);

  const apiStatus = {
    ebay: !!(process.env.EBAY_APP_ID && process.env.EBAY_CERT_ID),
    justtcg: !!process.env.JUSTTCG_API_KEY,
    psa: !!process.env.PSA_API_KEY,
  };

  return (
    <SettingsClient
      email={auth.user.email ?? ""}
      settings={settings}
      workspaceData={workspaceData}
      apiStatus={apiStatus}
      savedLocations={savedLocations}
    />
  );
}

// ── Fallback ──
function SettingsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 py-6" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton variant="text" className="w-48" />
      </div>
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-44 w-full" />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsLoader />
    </Suspense>
  );
}

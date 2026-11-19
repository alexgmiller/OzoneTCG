import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Skeleton } from "@/components/ui";
import { loadSettings, loadWorkspaceData, getSavedLocations, japaneseCatalogStatus } from "./actions";
import SettingsClient from "./SettingsClient";

// ── Loader ──
async function SettingsLoader() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return <div className="py-6 text-center text-sm text-muted-foreground">Not signed in.</div>;
  }

  const [settings, workspaceData, savedLocations, japaneseCatalog] = await Promise.all([
    loadSettings(),
    loadWorkspaceData(),
    getSavedLocations().catch(() => []),
    japaneseCatalogStatus().catch(() => null),
  ]);

  const apiStatus = {
    ebay: !!(process.env.EBAY_APP_ID && process.env.EBAY_CERT_ID),
    justtcg: !!process.env.JUSTTCG_API_KEY,
    psa: !!process.env.PSA_API_KEY,
    ppt: !!process.env.POKEMON_PRICE_TRACKER_API_KEY,
    pokeinvest: !!process.env.POKEINVEST_API_KEY,
  };

  return (
    <SettingsClient
      email={auth.user.email ?? ""}
      settings={settings}
      workspaceData={workspaceData}
      apiStatus={apiStatus}
      japaneseCatalog={japaneseCatalog}
      savedLocations={savedLocations}
    />
  );
}

// ── Fallback ──
function SettingsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 py-6 lg:max-w-6xl" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton variant="text" className="w-48" />
      </div>
      {/* lg+: two columns, like SettingsClient */}
      <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        <div className="space-y-6">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
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

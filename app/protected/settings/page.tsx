import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { hasPinConfigured } from "@/app/protected/guest/actions";
import { loadSettings, loadWorkspaceData, getSavedLocations } from "./actions";
import SettingsClient from "./SettingsClient";

async function SettingsLoader() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return <div className="p-8 text-center opacity-40">Not signed in.</div>;

  const [settings, workspaceData, pinConfigured, savedLocations] = await Promise.all([
    loadSettings(),
    loadWorkspaceData(),
    hasPinConfigured().catch(() => false),
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
      pinConfigured={pinConfigured}
      apiStatus={apiStatus}
      savedLocations={savedLocations}
    />
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="p-8 text-center opacity-40 text-sm">Loading settings…</div>
    }>
      <SettingsLoader />
    </Suspense>
  );
}

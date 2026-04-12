import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { hasPinConfigured } from "@/app/protected/guest/actions";
import { loadSettings } from "./actions";
import SettingsClient from "./SettingsClient";

async function SettingsLoader() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return <div className="p-8 text-center opacity-40">Not signed in.</div>;

  const [settings, pinConfigured] = await Promise.all([
    loadSettings(),
    hasPinConfigured().catch(() => false),
  ]);

  // Check which API keys are configured (server-side only — never expose keys)
  const apiStatus = {
    ebay: !!(process.env.EBAY_APP_ID && process.env.EBAY_CERT_ID),
    justtcg: !!process.env.JUSTTCG_API_KEY,
    psa: !!process.env.PSA_API_KEY,
  };

  return (
    <SettingsClient
      email={auth.user.email ?? ""}
      settings={settings}
      pinConfigured={pinConfigured}
      apiStatus={apiStatus}
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

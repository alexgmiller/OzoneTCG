import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { getActiveShow, getScheduledShowToday } from "@/app/protected/shows/actions";
import type { Mode, PickItem } from "./ledger";
import PosClient from "./PosClient";
import PosLoading from "./loading";

type Params = Promise<{ mode?: string; items?: string }>;

// ?mode=sell|trade&items=id,id preloads a selection (e.g. from Inventory)
async function PosLoader({ searchParams }: { searchParams: Params }) {
  const { mode, items: ids } = await searchParams;
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data: auth } = await supabase.auth.getUser();

  const [activeShow, scheduled, inventory, settings] = await Promise.all([
    getActiveShow(),
    getScheduledShowToday().catch(() => null),
    supabase.from("items")
      .select("id,name,set_name,card_number,grade,cert_number,market,cost,image_url")
      .eq("workspace_id", workspaceId).eq("status", "inventory")
      .order("name").limit(2000),
    supabase.from("user_settings").select("default_buy_pct").eq("user_id", auth.user?.id ?? "").maybeSingle(),
  ]);

  const items = (inventory.data ?? []) as PickItem[];
  const wanted = new Set(ids?.split(",") ?? []);
  const initialMode: Mode = mode === "sell" || mode === "trade" ? mode : "buy";

  return (
    <PosClient activeShow={activeShow} scheduled={scheduled} items={items}
      buyPct={Number(settings.data?.default_buy_pct ?? 70)} initialMode={initialMode}
      preselected={items.filter((it) => wanted.has(it.id))} />
  );
}

export default function PosPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={<PosLoading />}>
      <PosLoader searchParams={searchParams} />
    </Suspense>
  );
}

import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadConditionFactors } from "@/lib/conditionFactors";
import { DEFAULT_FACTORS } from "@/lib/conditionPricing";
import { getActiveShow, getScheduledShowToday } from "@/app/protected/shows/actions";
import { parseBuyPrefill } from "@/app/protected/inventory/addPrefill";
import type { Mode, NewCard, PickItem } from "./ledger";
import PosClient from "./PosClient";
import PosLoading from "./loading";

type Params = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// ?mode=sell|trade&items=id,id preloads a selection (e.g. from Inventory).
// ?mode=buy&name=… starts a buy with that card (Search's "Buy in POS").
async function PosLoader({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const mode = first(params.mode);
  const ids = first(params.items);
  const buy = parseBuyPrefill(params);
  const buyCards: NewCard[] = buy
    ? [{ name: buy.name, category: "single", set_name: buy.setName, card_number: buy.cardNumber, image_url: buy.imageUrl, market: buy.market }]
    : [];
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data: auth } = await supabase.auth.getUser();

  const [activeShow, scheduled, inventory, settings, condition] = await Promise.all([
    getActiveShow(),
    getScheduledShowToday().catch(() => null),
    supabase.from("items")
      .select("id,name,set_name,card_number,grade,cert_number,market,cost,image_url")
      .eq("workspace_id", workspaceId).eq("status", "inventory")
      .order("name").limit(2000),
    supabase.from("user_settings").select("default_buy_pct").eq("user_id", auth.user?.id ?? "").maybeSingle(),
    // Played singles in a buy or trade get the nightly job's condition discounts.
    // Loaded with the page, so they still apply if the show floor goes offline.
    loadConditionFactors(createAdminClient()).catch(() => null),
  ]);

  const items = (inventory.data ?? []) as PickItem[];
  const wanted = new Set(ids?.split(",") ?? []);
  const initialMode: Mode = mode === "sell" || mode === "trade" ? mode : "buy";

  return (
    <PosClient activeShow={activeShow} scheduled={scheduled} items={items}
      buyPct={Number(settings.data?.default_buy_pct ?? 70)} factors={condition?.factors ?? DEFAULT_FACTORS}
      initialMode={initialMode}
      preselected={items.filter((it) => wanted.has(it.id))} buyCards={buyCards} />
  );
}

export default function PosPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={<PosLoading />}>
      <PosLoader searchParams={searchParams} />
    </Suspense>
  );
}

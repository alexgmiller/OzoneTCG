import { Suspense } from "react";
import InventoryServer from "./InventoryServer";
import InventoryLoading from "./loading";
import { parseAddPrefill } from "./addPrefill";

// ?focus=<item id> opens that item on arrival (Home's MOST VALUABLE tiles link here).
// ?add=1&name=… opens the add sheet filled in with a card (Search's card sheet).
type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function InventoryPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const focus = Array.isArray(params.focus) ? params.focus[0] : params.focus;
  return (
    <Suspense fallback={<InventoryLoading />}>
      <InventoryServer focusId={focus ?? null} addPrefill={parseAddPrefill(params)} />
    </Suspense>
  );
}

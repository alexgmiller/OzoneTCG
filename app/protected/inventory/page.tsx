import { Suspense } from "react";
import InventoryServer from "./InventoryServer";
import InventoryLoading from "./loading";

// ?focus=<item id> opens that item on arrival (Home's MOST VALUABLE tiles link here)
export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const { focus } = await searchParams;
  return (
    <Suspense fallback={<InventoryLoading />}>
      <InventoryServer focusId={focus ?? null} />
    </Suspense>
  );
}

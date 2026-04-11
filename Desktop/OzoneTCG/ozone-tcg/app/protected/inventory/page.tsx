import { Suspense } from "react";
import InventoryServer from "./InventoryServer";
import InventoryLoading from "./loading";

export default function InventoryPage() {
  return (
    <Suspense fallback={<InventoryLoading />}>
      <InventoryServer />
    </Suspense>
  );
}

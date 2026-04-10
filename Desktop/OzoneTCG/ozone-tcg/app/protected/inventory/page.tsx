import { Suspense } from "react";
import InventoryServer from "./InventoryServer";

export const dynamic = "force-dynamic";

export default function InventoryPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm opacity-70">Loading inventory…</div>}>
      <InventoryServer />
    </Suspense>
  );
}

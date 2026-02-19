import { Suspense } from "react";
import SoldServer from "./SoldServer";

export default function SoldPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm opacity-70">Loading sales…</div>}>
      <SoldServer />
    </Suspense>
  );
}

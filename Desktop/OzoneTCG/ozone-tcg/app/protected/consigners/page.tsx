import { Suspense } from "react";
import ConsignersServer from "./ConsignersServer";

export default function ConsignersPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm opacity-70">Loading consigners…</div>}>
      <ConsignersServer />
    </Suspense>
  );
}

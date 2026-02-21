import { Suspense } from "react";
import BuyServer from "./BuyServer";

export default function BuyPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm opacity-70">Loading…</div>}>
      <BuyServer />
    </Suspense>
  );
}

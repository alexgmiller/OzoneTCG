import { Suspense } from "react";
import PayoutServer from "./PayoutServer";

export default function PayoutPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm opacity-50">Loading payout...</div>}>
      <PayoutServer />
    </Suspense>
  );
}

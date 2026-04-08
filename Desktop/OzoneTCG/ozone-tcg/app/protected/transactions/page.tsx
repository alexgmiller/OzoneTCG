import { Suspense } from "react";
import TransactionsServer from "./TransactionsServer";

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm opacity-50">Loading…</div>}>
      <TransactionsServer />
    </Suspense>
  );
}

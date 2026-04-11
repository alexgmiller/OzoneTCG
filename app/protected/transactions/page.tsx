import { Suspense } from "react";
import TransactionsServer from "./TransactionsServer";
import TransactionsLoading from "./loading";

export default function TransactionsPage() {
  return (
    <Suspense fallback={<TransactionsLoading />}>
      <TransactionsServer />
    </Suspense>
  );
}

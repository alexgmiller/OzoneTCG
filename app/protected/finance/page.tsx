import { Suspense } from "react";
import { getFinanceData } from "./actions";
import FinanceClient from "./FinanceClient";
import FinanceLoading from "./loading";

async function FinanceLoader() {
  const data = await getFinanceData();
  return <FinanceClient data={data} />;
}

export default function FinancePage() {
  return (
    <Suspense fallback={<FinanceLoading />}>
      <FinanceLoader />
    </Suspense>
  );
}

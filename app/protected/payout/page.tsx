import { Suspense } from "react";
import PayoutServer from "./PayoutServer";
import PayoutLoading from "./loading";

export default function PayoutPage() {
  return (
    <Suspense fallback={<PayoutLoading />}>
      <PayoutServer />
    </Suspense>
  );
}

import { Suspense } from "react";
import ConsignersServer from "./ConsignersServer";
import ConsignersLoading from "./loading";

export default function ConsignersPage() {
  return (
    <Suspense fallback={<ConsignersLoading />}>
      <ConsignersServer />
    </Suspense>
  );
}

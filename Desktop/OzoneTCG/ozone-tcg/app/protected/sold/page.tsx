import { Suspense } from "react";
import SoldServer from "./SoldServer";
import SoldLoading from "./loading";

export default function SoldPage() {
  return (
    <Suspense fallback={<SoldLoading />}>
      <SoldServer />
    </Suspense>
  );
}

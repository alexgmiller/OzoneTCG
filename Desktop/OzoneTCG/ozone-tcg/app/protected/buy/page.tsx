import { Suspense } from "react";
import BuyServer from "./BuyServer";
import BuyLoading from "./loading";

export default function BuyPage() {
  return (
    <Suspense fallback={<BuyLoading />}>
      <BuyServer />
    </Suspense>
  );
}

import { Suspense } from "react";
import ShowsServer from "./ShowsServer";
import ShowsLoading from "./loading";

export default function ShowsPage() {
  return (
    <Suspense fallback={<ShowsLoading />}>
      <ShowsServer />
    </Suspense>
  );
}

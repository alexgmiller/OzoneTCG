import { Suspense } from "react";
import ShowsServer from "./ShowsServer";

export default function ShowsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center opacity-40 text-sm">Loading shows…</div>}>
      <ShowsServer />
    </Suspense>
  );
}

import { Suspense } from "react";
import ProtectedIndexServer from "./ProtectedIndexServer";

export default function ProtectedIndexPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm opacity-70">Loading…</div>}>
      <ProtectedIndexServer />
    </Suspense>
  );
}

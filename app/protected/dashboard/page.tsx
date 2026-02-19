import { Suspense } from "react";
import DashboardServer from "./DashboardServer";

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm opacity-70">Loading dashboard…</div>}>
      <DashboardServer />
    </Suspense>
  );
}

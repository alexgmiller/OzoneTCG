import { Suspense } from "react";
import DashboardServer from "./DashboardServer";
import DashboardLoading from "./loading";

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardServer />
    </Suspense>
  );
}

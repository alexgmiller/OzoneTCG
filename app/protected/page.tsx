import { Suspense } from "react";
import LoadingScreen from "@/components/LoadingScreen";
import ProtectedIndexServer from "./ProtectedIndexServer";

export default function ProtectedIndexPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ProtectedIndexServer />
    </Suspense>
  );
}

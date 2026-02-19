"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { subscribeWorkspaceTable } from "@/lib/supabase/realtime";

export default function DashboardClient({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();

  useEffect(() => {
    const subs = (["items", "expenses", "grading"] as const).map((table) =>
      subscribeWorkspaceTable({
        workspaceId,
        table,
        onChange: () => router.refresh(),
      })
    );

    return () => {
      subs.forEach(({ supabase, channel }) => supabase.removeChannel(channel));
    };
  }, [router, workspaceId]);

  return null;
}
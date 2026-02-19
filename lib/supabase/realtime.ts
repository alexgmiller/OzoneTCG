"use client";

import { createBrowserClient } from "@supabase/ssr";

export function subscribeWorkspaceTable(opts: {
  workspaceId: string;
  table: "items" | "expenses" | "grading";
  onChange: () => void;
}) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  const channel = supabase
    .channel(`${opts.table}:${opts.workspaceId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: opts.table,
        filter: `workspace_id=eq.${opts.workspaceId}`,
      },
      () => opts.onChange()
    )
    .subscribe();

  return { supabase, channel };
}

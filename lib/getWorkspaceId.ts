import { createClient } from "@/lib/supabase/server";

// Single-company app: every signed-in user works in the one workspace set by env.
export async function getWorkspaceId() {
  const supabase = await createClient();

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth.user) throw new Error("Not logged in");

  const workspaceId = process.env.OZONE_WORKSPACE_ID;
  if (!workspaceId) throw new Error("OZONE_WORKSPACE_ID is not set");

  return workspaceId;
}

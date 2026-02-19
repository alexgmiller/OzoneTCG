import { createClient } from "@/lib/supabase/server";

export async function getWorkspaceId() {
  const supabase = await createClient();

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth.user) throw new Error("Not logged in");

  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", auth.user.id)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.workspace_id) throw new Error("No workspace membership found");

  return data.workspace_id as string;
}

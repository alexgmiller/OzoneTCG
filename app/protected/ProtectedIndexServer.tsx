import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ProtectedIndexServer() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) redirect("/auth/login");

  redirect("/protected/dashboard");

  return null;
}

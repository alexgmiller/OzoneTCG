import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * Admin section — only accessible by the account whose email matches ADMIN_EMAIL.
 * Falls back to blocking anyone if ADMIN_EMAIL is unset.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    redirect("/protected/dashboard");
  }

  return <>{children}</>;
}

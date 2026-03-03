"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  return (
    <button
      onClick={logout}
      className="flex items-center gap-1.5 text-sm px-2 py-1.5 rounded-lg hover:bg-muted transition-colors"
      title="Logout"
    >
      <LogOut size={16} />
      <span className="hidden md:inline">Logout</span>
    </button>
  );
}

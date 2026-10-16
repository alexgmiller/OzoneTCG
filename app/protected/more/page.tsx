"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, LogOut } from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { MORE_GROUPS } from "@/components/shell/nav";

// ── More ──
// A simple grouped list of everything that is not a tab. Shows first.
// The header carries the quick theme icon; the full toggle lives in Settings.
export default function MorePage() {
  const router = useRouter();

  async function logout() {
    const { createClient } = await import("@/lib/supabase/client");
    await createClient().auth.signOut();
    router.push("/auth/login");
  }

  return (
    <div className="mx-auto w-full max-w-lg py-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-foreground">More</h1>
        <ThemeSwitcher />
      </div>

      <div className="flex flex-col gap-5">
        {MORE_GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="section-label mb-2 px-1">{g.title}</h2>
            <ul className="overflow-hidden rounded-2xl bg-surface">
              {g.items.map((i) => {
                const Icon = i.icon;
                return (
                  <li key={i.href} className="border-b border-border last:border-b-0">
                    <Link
                      href={i.href}
                      className="flex h-14 items-center gap-3 px-4 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-surface-2"
                    >
                      <Icon size={20} strokeWidth={1.75} className="text-muted-foreground" />
                      <span className="flex-1">{i.label}</span>
                      <ChevronRight size={18} className="text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <button
          type="button"
          onClick={logout}
          className="flex h-14 w-full items-center gap-3 rounded-2xl bg-surface px-4 text-sm font-medium text-down transition-colors duration-150 hover:bg-surface-2"
        >
          <LogOut size={20} strokeWidth={1.75} />
          Log out
        </button>
      </div>
    </div>
  );
}

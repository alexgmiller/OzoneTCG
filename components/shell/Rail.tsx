"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { TABS, isActive, isMoreActive } from "./nav";

// ── Rail (desktop) ──
// The same five destinations in a slim icon-only left rail.
export default function Rail({ hasActiveShow = false }: { hasActiveShow?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    const { createClient } = await import("@/lib/supabase/client");
    await createClient().auth.signOut();
    router.push("/auth/login");
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-20 flex-col items-center border-r border-border bg-surface py-4 md:flex">
      <Link href="/protected/dashboard" aria-label="OzoneTCG home" className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-accent-tint text-base font-bold text-accent">
        O
      </Link>

      <nav aria-label="Primary" className="flex flex-1 flex-col items-center gap-2">
        {TABS.map((t) => {
          const active = t.href === "/protected/more" ? isMoreActive(pathname) : isActive(pathname, t.href);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              title={t.label}
              aria-label={t.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-150",
                active ? "bg-surface-2 text-accent" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <Icon size={22} strokeWidth={active ? 2.25 : 1.75} />
              {hasActiveShow && t.href === "/protected/pos" && !active && (
                <span className="absolute right-2.5 top-2 h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col items-center gap-1">
        <ThemeSwitcher />
        <button
          type="button"
          onClick={logout}
          title="Log out"
          aria-label="Log out"
          className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-surface-2 hover:text-foreground"
        >
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { TABS, isActive, isMoreActive } from "./nav";

// ── TabBar (mobile) ──
// A rounded-full pill inset 16px from the edges and the safe-area bottom.
// --surface at 80% with backdrop blur; light mode adds the one allowed shadow.
// The active tab sits in a raised --surface-2 pill with an accent icon.
export default function TabBar({ hasActiveShow = false }: { hasActiveShow?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => { TABS.forEach((t) => router.prefetch(t.href)); }, [router]);

  return (
    <nav
      aria-label="Primary"
      className="tabbar-inset fixed inset-x-4 z-40 flex h-16 items-center justify-around rounded-full bg-tabbar px-2 shadow-tabbar backdrop-blur-md md:hidden"
    >
      {TABS.map((t) => {
        const active = t.href === "/protected/more" ? isMoreActive(pathname) : isActive(pathname, t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-label={t.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-12 w-14 items-center justify-center rounded-full transition-colors duration-150",
              active ? "bg-surface-2 text-accent" : "text-muted-foreground",
            )}
          >
            <Icon size={24} strokeWidth={active ? 2.25 : 1.75} />
            {hasActiveShow && t.href === "/protected/pos" && !active && (
              <span className="absolute right-3 top-2.5 h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

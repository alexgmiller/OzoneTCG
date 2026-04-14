import { EnvVarWarning } from "@/components/env-var-warning";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import MobileBottomNav from "@/components/NavLinks";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";
import { hasPinConfigured } from "@/app/protected/guest/actions";
import { getActiveShow } from "@/app/protected/show/actions";

function money(v: number) {
  return `$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pinConfigured, activeShow] = await Promise.all([
    hasPinConfigured().catch(() => false),
    getActiveShow().catch(() => null),
  ]);

  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 w-full flex flex-col">
        <nav className="nav-glass w-full h-14 sticky top-0 z-40">
          <div className="w-full h-full flex justify-between items-center px-4 text-sm">
            <Link href="/protected/dashboard" className="font-bold text-base tracking-tight">
              <span style={{ color: "var(--accent-primary)" }}>Ozone</span><span style={{ color: "var(--text-bright)" }}>TCG</span>
            </Link>

            <div className="flex items-center gap-2">
              <ThemeSwitcher />
              {!hasEnvVars ? (
                <EnvVarWarning />
              ) : (
                <Suspense>
                  <AuthButton />
                </Suspense>
              )}
            </div>
          </div>
        </nav>

        {/* Active show banner — visible on all pages when a show is running */}
        {activeShow && (
          <a
            href="/protected/show"
            className="w-full flex items-center justify-between px-4 py-1.5 text-xs font-medium gap-3 border-b border-amber-400/20 bg-amber-400/8 hover:bg-amber-400/12 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <span className="text-amber-700 dark:text-amber-300 font-semibold truncate">
                Show active: {activeShow.name}
              </span>
            </div>
            <span className="text-amber-600 dark:text-amber-400 shrink-0 tabular-nums">
              Cash: {money(activeShow.expected_cash)} →
            </span>
          </a>
        )}

        {/* pb-16 leaves room for the mobile bottom tab bar */}
        <div className="flex-1 flex flex-col px-4 sm:px-8 lg:px-14 pb-16 md:pb-0">
          {children}
        </div>
      </div>
      {/* Rendered outside the sticky/backdrop-blur nav to keep fixed positioning intact on Safari */}
      <MobileBottomNav hasPinConfigured={pinConfigured} hasActiveShow={!!activeShow} />
    </main>
  );
}

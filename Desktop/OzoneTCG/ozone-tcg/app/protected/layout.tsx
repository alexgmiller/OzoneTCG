import { EnvVarWarning } from "@/components/env-var-warning";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 w-full flex flex-col">
        <nav className="w-full border-b border-b-foreground/10 h-14 sticky top-0 z-40 bg-background">
          <div className="w-full h-full flex justify-between items-center px-4 text-sm">
            <Link href="/protected/dashboard" className="font-bold text-base tracking-tight">
              OzoneTCG
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

        {/* pb-16 leaves room for the mobile bottom tab bar */}
        <div className="flex-1 flex flex-col px-4 sm:px-8 lg:px-14 pb-16 md:pb-0">
          {children}
        </div>
      </div>
    </main>
  );
}

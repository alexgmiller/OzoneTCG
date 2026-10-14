import Link from "next/link";
import AppNav from "@/components/AppNav";
import ActiveShowBanner from "@/components/ActiveShowBanner";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { createClient } from "@/lib/supabase/server";
import { getActiveShow } from "@/app/protected/shows/actions";

// ── Signed-in handle for the sidebar footer ──
async function getHandle(): Promise<string> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const email = data?.claims?.email as string | undefined;
    return email?.split("@")[0] ?? "Account";
  } catch {
    return "Account";
  }
}

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const [activeShow, handle] = await Promise.all([
    getActiveShow().catch(() => null),
    getHandle(),
  ]);

  return (
    <div className="min-h-dvh bg-background">
      <AppNav handle={handle} hasActiveShow={!!activeShow} />

      {/* Sidebar is fixed on md+, so content shifts right by its width */}
      <div className="flex min-h-dvh flex-col md:pl-56">
        {/* ── Mobile header ── */}
        <header className="md:hidden sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur-sm">
          <Link href="/protected/dashboard" className="text-base font-bold tracking-tight text-foreground">
            <span className="text-primary">Ozone</span>TCG
          </Link>
          <ThemeSwitcher />
        </header>

        {/* ── Active show banner ── hides itself on Home and POS */}
        <ActiveShowBanner show={activeShow} />

        {/* pb-20 clears the h-16 mobile tab bar */}
        <main className="flex w-full flex-1 flex-col px-4 pb-20 md:px-8 md:pb-5">
          {children}
        </main>
      </div>
    </div>
  );
}
